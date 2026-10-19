# Nicktoons Block Party — el juego original

No es un remake. Es el **juego original de la carpeta** (`main-flash.swf` + todos sus
assets) ejecutándose en el navegador mediante **Ruffle**, un emulador Flash escrito en
WebAssembly.

**En vivo:** https://blockparty-original.vercel.app

## Cómo funciona

- `index.html` arranca Ruffle y le indica `main-flash.swf`, el loader real del juego.
  (El otro loader de la carpeta, `game.swf`, carga pero no arranca la lógica.)
- `ruffle/` es el build nocturno de Ruffle que emula Flash en el navegador.
- Se sirve el árbol `content/www.funkypotato.com/…` tal cual, porque el juego pide sus
  assets (tableros, personajes, minijuegos, audio, XML) por rutas relativas.
- `serve.mjs` es un servidor estático local con el MIME correcto para `.wasm` y `.swf`.

## Ejecutar en local

```bash
node blockparty/serve.mjs
# abrir http://localhost:8090/blockparty/index.html
```

Sonido: el navegador exige un gesto del usuario para el audio, así que haz clic dentro
del juego una vez cargue.

## Notas

- Se eliminó `ruffle_web-wasm_mvp_bg…wasm` (el build para navegadores antiguos) para
  entrar en el límite de 100 MB del plan Hobby de Vercel. Los navegadores actuales usan
  `ruffle_web_bg…wasm`, que es el que se sirve.
- `?swf=<ruta>` permite probar otro loader sin editar el HTML.

## Multijugador: por qué no puede haber en este SWF

Se inspeccionó el binario directamente (el SWF va comprimido con zlib cuando el header
es `CWS`; se descomprime y se buscan símbolos de ActionScript). El resultado:

- **Sí contiene:** `URLLoader`, `URLRequest`, `Responder`, `SharedObject`,
  `flash.net`, `flash.events`, `Security`.
- **No contiene:** `NetConnection`, `Socket`, `XMLSocket`, `NetStream`.

`URLLoader`/`URLRequest` se usan para cargar los XML y los SWFs del juego, y
`SharedObject` para guardar datos en local (tipo cookie). Sin `NetConnection` ni `Socket`
**no hay forma de que el juego hable con un servidor**. Es un juego local: una persona
contra la máquina (el selector de personajes ofrece `YOU` + `COM1` + `COM2`, que son IA).

Que un SWF sin código fuente pudiera jugar en red requeriría inyectar código de red
dentro del binario compilado (descompilar/recompilar ActionScript 3) y además cambiar el
diseño, que está pensado para un solo jugador contra la IA. No es viable.

Para jugar **con amigos en la misma partida**, la vía es el prototipo multijugador en
HTML5 desplegado en https://nickparty.vercel.app.
