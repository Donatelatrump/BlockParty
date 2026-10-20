# Nicktoons Block Party Online

Remake HTML5 con React, TypeScript y servidor autoritativo. El original Flash con Ruffle está en `../blockparty` y es una aplicación diferente.

## Jugar localmente

Node.js 24 y npm. Desde esta carpeta:

```sh
npm install
npm run dev
```

Abre `http://localhost:5173`, crea una sala y elige un mapa. Activa la CPU para jugar solo o comparte el enlace. Cada pestaña guarda su identidad; recargar conserva la sala en el enlace y la identidad de la pestaña.

Para probar la compilación de producción con HTTP y WebSocket juntos:

```sh
npm run build
npm run build:server
npm run preview:game
```

El servidor escucha en `127.0.0.1:5173`. `PORT` cambia el puerto; `HOST=0.0.0.0` permite acceder desde otros equipos. Para alojar el cliente separado del servidor, define `VITE_WS_URL=wss://tu-servidor/api/ws` al compilar.

## Mapas y reglas

- Los nueve mapas usan las **386 casillas y 420 tramos** extraídos de los SWF originales, con sus coordenadas, conexiones dirigidas y curvas. No son circuitos circulares generados.
- En una bifurcación, el jugador activo elige una salida desde el mapa o los botones. El servidor valida la elección y conserva los pasos restantes. La CPU también elige caminos válidos.
- Cámara con zoom de 100% a 400%, rueda, deslizador, arrastre y pellizco. El seguimiento del turno se activa por separado; mover el mapa manualmente lo desactiva.
- Los ocho personajes usan 589 fotogramas extraídos de sus SWF: reposo, caminar, salto, daño, victoria y derrota. Se conservan las máscaras de transparencia y se precargan los fotogramas antes de animarlos. El modo de movimiento reducido muestra una pose estática.
- Encontrar una moneda dorada durante el recorrido ofrece la compra y después continúa el movimiento pendiente.
- Tirada, desplazamiento, resolución de casilla y elección de camino tienen fases separadas. No puedes tirar otra vez mientras se resuelve una acción.
- Tienda, objetos, trivia, congelación, bloqueos, tiradas extra, minijuegos, clasificación y reinicio forman parte del flujo. La última ronda también tiene minijuego.
- Las desconexiones transfieren el anfitrión y evitan ventanas bloqueadas. Sin humanos conectados, la sala se pausa; se elimina tras 90 segundos sin humanos.

Las partidas seleccionan sin repetición entre los 18 minijuegos nombrados en el XML original: Secret Sequence, Puppy Pincher, Frosty Floor Fill-In, Spinnin' Spatula, Platform Plunge, Escape Oom, Tasty Race, Balancing Bonanza, Locker Lock, Music Drop, Yo Running Race, King of the Heap, Pizza Pursuit, Apartment Maze, Demanding Goat, iBed Bounce, iSlap Shot y Jelly Bubble. Cada uno tiene controles y reglas propios, CPU y validación del servidor. Los tres prototipos anteriores quedan solo como compatibilidad con estados antiguos y no se seleccionan en partidas nuevas.

El flujo incluye cinco segundos de instrucciones, tres de cuenta atrás y cinco de resultados. La duración de juego depende del minijuego. Al terminar la partida se conceden monedas doradas por monedas obtenidas en minijuegos, casillas azules y trivias correctas; los líderes empatados comparten el premio. Las casillas azules y rojas suman y restan cinco monedas, respectivamente.

El botón «Activar sonido» habilita la música original del mapa y tonos breves para tiradas y cambios de fase. Incluye volumen y silencio; la reproducción requiere una interacción del usuario por las restricciones del navegador.

Las mecánicas HTML5 están basadas en las instrucciones originales. Los escenarios de minijuegos, la física, las duraciones y la conversión de puntos a monedas son adaptaciones; no se ha portado el ActionScript completo ni verificado una equivalencia exacta con Flash. Las instrucciones originales se encuentran en `../content/www.funkypotato.com/gamez/nick-block-party/xml/translation.xml`.

Para regenerar personajes y música desde los SWF locales, sin dependencias Python externas:

```sh
python scripts/extract-original-media.py
```

Genera JPEG y máscaras PNG en `public/assets/sprites`, la línea de tiempo en `shared/original-character-sprites.json` y las nueve pistas MP3 en `public/assets/audio`. Los archivos intermedios quedan en `.asset-extraction`, ignorados por Git.

## Origen de los recorridos

`scripts/extract-board-paths.py` lee las instancias `t0`, `t1`, etc. y sus matrices para las casillas; usa etiquetas de la línea de tiempo como `o12-40` para los tramos dirigidos. Conserva las curvas y reconoce la etiqueta original de Fanboy ` 35-15`.

```sh
npm run extract:paths
```

Genera `shared/original-board-paths.json`. Las pruebas comprueban las salidas, los destinos y que todo el mapa se alcanza desde el inicio.

## Red y seguridad

La pestaña genera un secreto con `crypto.randomUUID()`. El servidor deriva una identidad pública e ignora la identidad que el cliente intente adjudicarse. Reconectar reemplaza el socket anterior. Las acciones antiguas no se reproducen tras reconectar.

`server/public-state.ts` elimina respuestas correctas y oculta cartas no reveladas. El banco de respuestas está en `server/trivia.json`, fuera del bundle del navegador. Hay validación de mensajes y límites de tamaño y frecuencia.

Sin `REDIS_URL`, todos los jugadores deben conectarse al mismo proceso. Con `REDIS_URL`, las instancias usan pub/sub como pasarelas hacia una sola autoridad elegida mediante un arrendamiento renovable. Solo ella ejecuta reglas y temporizadores. `REDIS_NAMESPACE` separa despliegues en un Redis compartido.

**Redis coordina y transporta mensajes; no guarda partidas duraderas.** Si termina el proceso autoritativo, las partidas en memoria se pierden. Usa un servidor persistente para partidas largas: reconectar un socket no recupera una partida tras reiniciar el servidor. El despliegue serverless existente requiere considerar esta limitación. [Documentación oficial de WebSockets en Vercel](https://vercel.com/kb/guide/real-time-chat-websockets).

## Verificación

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

`npm test` incluye partidas completas con ocho jugadores en los nueve mapas, los 18 minijuegos con ocho participantes, selección sin repeticiones, ventanas de salto, memoria de secuencias, clasificación de pulgas, pintura, puertas del laberinto, bonificaciones, pausa durante resultados y validación de los 589 fotogramas con sus máscaras. También verifica CPU, cruces, compra durante el movimiento, congelación, reconexión, privacidad y sockets reales. La prueba entre dos pasarelas usa ioredis contra una simulación local del protocolo Redis; no sustituye una prueba con Redis de producción.

`test:browser` necesita servidor local y Brave instalado; `BRAVE_PATH` permite elegir otro Chromium. Recorre tienda y trivia, elige caminos, juega y verifica el resultado en dos pestañas. En entornos que impiden iniciar navegadores puede fallar con `EPERM`.


## Controles y revisión visual

Usa WASD o flechas para moverte y Espacio para la acción indicada. En celular aparecen botones táctiles: puedes mantener una dirección y saltar con otro dedo. Los juegos de selección permiten tocar sus objetivos; las pulgas y los alimentos también se pueden arrastrar. El dado se lanza sobre el tablero. El mapa admite arrastre y zoom con dos dedos.

`npm run check:gameplay-ui`, con `npm run dev` activo, verifica los 21 escenarios en escritorio y tres tamaños táctiles. Guarda capturas en `screenshots/gameplay`. `BRAVE_PATH` permite indicar otro Chromium.

Los fondos, objetos y monedas se regeneran con `python scripts/extract-minigame-media.py` (requiere Pillow). Consulta [la comparación con el original](REVISION_FIDELIDAD.md) para las correcciones y las diferencias que permanecen.


El catálogo incluye los 18 minijuegos basados en Block Party y tres pruebas nuevas: **Islas de color**, **Semáforo tramposo** y **Tesoro bajo fuego**. El salto tiene altura compartida con la colisión y respuesta de golpe/salto limpio. El laberinto cambia en cada partida y requiere dos llaves, con visibilidad limitada tras una breve vista inicial.


El inicio incluye selección mediante tarjetas, vista animada con encuadre uniforme, nombres, marca del personaje elegido y navegación con flechas del teclado. `npm run check:home-ui` verifica selección, persistencia, tamaños 1440/390/320 y una sala real con ocho conexiones; captura el inicio y el tablero en `screenshots/home`.

`npm run check:animation-ui` comprueba varios ciclos de los ocho personajes mediante 72 capturas y análisis de píxeles (requiere Pillow). Cada fotograma conserva su imagen y máscara; solo cambia la opacidad, para evitar parpadeos al resolver otra máscara.

La prueba de red de ocho jugadores recorre los 21 minijuegos, compara el estado recibido por todos, mantiene ocho controles simultáneos durante 160 acciones, rechaza una novena plaza y verifica la reconexión sin duplicar jugadores. Es una prueba local; no mide latencia en Internet ni dispositivos físicos.


## Personaje personalizado: Martín

Los ocho archivos de `../Personajes_Personalizados/Martin/idle_SE_01.png` a `idle_SE_08.png` forman una sola animación de reposo. `python scripts/import-custom-character.py` genera copias PNG transparentes de 256×256 en `public/assets/custom/martin`, con escala común y pies alineados; los originales permanecen intactos. El encuadre ignora ruido casi transparente del exportador. El manifiesto es `shared/custom-characters.json`.

Martín aparece como noveno personaje del catálogo, con un máximo independiente de ocho jugadores. El reposo se reproduce a 8 fotogramas por segundo. Las direcciones y acciones que todavía no tienen dibujos propios utilizan el reposo como sustituto; el salto vertical sigue a cargo de la física del juego. No se presentan esos sustitutos como animaciones completas de caminar, saltar, daño o celebración.

`node scripts/check-custom-character-ui.mjs` verifica transparencia nativa, bucle y sustitutos de acciones/direcciones sin archivos ausentes. La selección y las pruebas de animación incluyen a los nueve personajes; las pruebas de minijuegos mantienen ocho participantes e incluyen a Martín.


La importación personalizada ahora recorre todas las subcarpetas de `../Personajes_Personalizados`: **Martín, Jovany, Luna, Marfileño y Yocsan**. El catálogo suma 13 personajes y conserva un máximo de ocho jugadores. Cada carpeta tiene ocho fotogramas de reposo; las acciones sin dibujos propios continúan usando el sustituto de reposo. Los IDs se normalizan para rutas (por ejemplo, `Marfileño` → `marfileno`), conservando el nombre visible.

Escape Oom incorpora preparación, extensión, golpe y retirada con poses originales y un carril iluminado. Cada ciclo se reduce de 3200 a 1500 ms, manteniendo al menos 1200 ms desde el aviso hasta el golpe. El servidor, la CPU y la animación usan el mismo reloj; Espacio no activa un salto en este minijuego.
