# Correcciones de jugabilidad — 19 de octubre de 2026

Aplicadas al remake HTML5 de `nickparty`:

- Cámara: zoom continuo de 100% a 400%, botones, deslizador, rueda, arrastre y pellizco. Seguimiento independiente y transición al cambiar de turno.
- Personajes: 589 fotogramas originales extraídos de los ocho SWF, con transparencia, estados direccionales y animaciones de reposo, caminar, salto, daño, victoria y derrota. Precarga y respeto de movimiento reducido.
- Catálogo: 18 minijuegos basados en las instrucciones originales, con mecánicas propias y selección aleatoria sin repetir hasta agotar el catálogo. Los tres prototipos genéricos ya no aparecen en partidas nuevas.
- Flujo: instrucciones, cuenta atrás, juego, resultados y regreso al tablero. Los temporizadores se conservan al pausar y reconectar.
- Servidor: valida entradas, tiempos, límites, objetos capturados, orden de colores y puntuación; ejecuta física y CPU. Las secuencias futuras y los colores fuera de su ventana de exhibición no se envían al cliente.
- Reglas: casillas azules +5 y rojas −5; bonificaciones finales por monedas en minijuegos, casillas azules y trivias correctas, incluyendo empates. Se elimina el premio automático de una moneda dorada por cada minijuego.
- Audio: nueve músicas originales extraídas, activación explícita, volumen, silencio y tonos de eventos.
- Interfaz: monedas doradas en lugar de estrellas; desglose de bonificaciones y animación de victoria en el cierre.

## Archivos principales

`src/Board.tsx`, `src/CharacterSprite.tsx`, `src/OriginalMinigame.tsx`, `src/GameAudio.tsx`, `shared/minigames.ts`, `server/minigames.ts`, `server/room.ts`.

El catálogo y las instrucciones se contrastaron con `../content/www.funkypotato.com/gamez/nick-block-party/xml/translation.xml`. Los fotogramas y las músicas provienen de `assets/characters` y `assets/audio/music/boards` de ese mismo original local. `scripts/extract-original-media.py` reproduce la extracción con la biblioteca estándar de Python.

## Alcance y verificación

Los minijuegos son adaptaciones HTML5: escenarios, física, tiempos, distribución para hasta ocho jugadores y conversión de puntos a monedas no equivalen a un port completo del ActionScript. Las animaciones recuperan fotogramas bitmap de las líneas de tiempo, sin ejecutar los scripts y efectos vectoriales del SWF.

Las pruebas automáticas cubren los 18 minijuegos con ocho participantes, partidas completas en los nueve mapas, controles inválidos, ventanas de salto, secuencias, clasificación de pulgas, cambios de dueño del suelo, puertas, puntuación, bonos y pausa/reconexión. También validan los 589 pares de imagen y máscara. El chequeo de tipos y la compilación de producción se ejecutan desde `nickparty`.

La comparación visual y táctil en navegador sigue pendiente: este entorno impide iniciar Chromium con `spawn EPERM`. El resultado está aplicado localmente; no se publicó un despliegue.
