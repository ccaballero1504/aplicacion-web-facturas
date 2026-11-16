// Lanzador de la aplicación de facturas.
//
// Programa de consola que lleva la aplicación dentro, la sirve en http://localhost:8000
// y abre el navegador. No necesita instalar nada (ni Python ni Node).
// Se cierra con Ctrl+C o cerrando la ventana de la consola.
package main

import (
	"embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

//go:embed all:app
var archivosEmbebidos embed.FS

const rutaComprobacion = "/__facturas"

var version = "dev" // se rellena al compilar

func main() {
	puerto := flag.Int("puerto", 8000, "puerto local (si lo cambias, no verás los datos guardados en el 8000)")
	sinNavegador := flag.Bool("sin-navegador", false, "no abrir el navegador automáticamente")
	flag.Parse()

	fmt.Println("==============================================")
	fmt.Println("  Facturas - aplicación local  (" + version + ")")
	fmt.Println("==============================================")

	url := fmt.Sprintf("http://localhost:%d/", *puerto)
	archivos, origen := elegirArchivos()

	listeners, err := escuchar(*puerto)
	if err != nil {
		if yaEstaAbierta(*puerto) {
			fmt.Println("\nLa aplicación ya estaba en marcha. Abriendo el navegador…")
			fmt.Println("  " + url)
			if !*sinNavegador {
				abrirNavegador(url)
			}
			time.Sleep(3 * time.Second)
			return
		}
		salirConError(fmt.Sprintf(
			"No se puede usar el puerto %d: otro programa lo está usando.\n"+
				"Cierra ese programa o arranca con otro puerto, por ejemplo:\n"+
				"  facturas -puerto 8001\n"+
				"(Ojo: con otro puerto no verás los datos guardados en el puerto 8000.)", *puerto))
	}

	mux := http.NewServeMux()
	mux.HandleFunc(rutaComprobacion, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "facturas") })
	servidorArchivos := http.FileServer(http.FS(archivos))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Sin caché, para que al actualizar la app se vean los cambios al momento.
		w.Header().Set("Cache-Control", "no-store")
		servidorArchivos.ServeHTTP(w, r)
	}))
	servidor := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}

	for _, l := range listeners {
		go func(l net.Listener) {
			if err := servidor.Serve(l); err != nil && !errors.Is(err, http.ErrServerClosed) {
				fmt.Println("Error del servidor:", err)
			}
		}(l)
	}

	fmt.Println("\nLa aplicación está funcionando en:")
	fmt.Println("  " + url)
	fmt.Println("\nArchivos: " + origen)
	fmt.Println("\nDeja esta ventana abierta mientras uses la aplicación.")
	fmt.Println("Para cerrarla pulsa Ctrl+C o cierra esta ventana.")

	if !*sinNavegador {
		abrirNavegador(url)
	}

	senal := make(chan os.Signal, 1)
	signal.Notify(senal, os.Interrupt, syscall.SIGTERM)
	<-senal
	fmt.Println("\nCerrando la aplicación. ¡Hasta luego!")
	servidor.Close()
}

// elegirArchivos usa la carpeta del ejecutable si contiene la app (útil para actualizarla
// sin recompilar); si no, usa la copia que va dentro del ejecutable.
func elegirArchivos() (fs.FS, string) {
	if exe, err := os.Executable(); err == nil {
		if real, err := filepath.EvalSymlinks(exe); err == nil {
			exe = real
		}
		for _, dir := range []string{filepath.Dir(exe), filepath.Dir(filepath.Dir(exe))} {
			if existe(filepath.Join(dir, "index.html")) && existe(filepath.Join(dir, "js", "app.js")) {
				return os.DirFS(dir), "carpeta " + dir
			}
		}
	}
	sub, err := fs.Sub(archivosEmbebidos, "app")
	if err != nil {
		salirConError("El ejecutable está dañado: " + err.Error())
	}
	return sub, "incluidos en el ejecutable"
}

// escuchar abre el puerto solo en este ordenador (IPv4 y, si se puede, IPv6),
// para que nadie de la red pueda entrar.
func escuchar(puerto int) ([]net.Listener, error) {
	l4, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", puerto))
	if err != nil {
		return nil, err
	}
	listeners := []net.Listener{l4}
	if l6, err := net.Listen("tcp", fmt.Sprintf("[::1]:%d", puerto)); err == nil {
		listeners = append(listeners, l6)
	}
	return listeners, nil
}

func yaEstaAbierta(puerto int) bool {
	cliente := http.Client{Timeout: 2 * time.Second}
	r, err := cliente.Get(fmt.Sprintf("http://127.0.0.1:%d%s", puerto, rutaComprobacion))
	if err != nil {
		return false
	}
	defer r.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(r.Body, 64))
	return strings.TrimSpace(string(b)) == "facturas"
}

func abrirNavegador(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Println("\nNo he podido abrir el navegador. Ábrelo tú y entra en:", url)
	}
}

func existe(ruta string) bool {
	_, err := os.Stat(ruta)
	return err == nil
}

func salirConError(msg string) {
	fmt.Println("\nERROR: " + msg)
	fmt.Println("\nPulsa Intro para cerrar…")
	fmt.Scanln()
	os.Exit(1)
}
