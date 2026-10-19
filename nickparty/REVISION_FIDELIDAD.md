# Revisión de fidelidad — 19 de octubre de 2026

El remake está en `nickparty`; `../blockparty` ejecuta el SWF original con Ruffle. Estos cambios corresponden al remake y no se han publicado.

## Cambios realizados

- Tirada visible sobre el tablero: caras cambiantes, giro, salto y resultado antes de iniciar el recorrido. Los dados dobles y triples muestran sus caras individuales y su suma. El servidor comparte el inicio y la duración con todos los espectadores.
- Ventana de cámara con altura definida, recorte del escenario y zoom inicial de 235%. Se conserva el seguimiento del jugador y la consulta manual del mapa. Faltaban estilos para el contenedor del escenario, el recorrido introductorio y el rótulo del mapa.
- Minijuegos: corrección de caracteres de control e iconos ausentes en comida, cabra, casilleros, obstáculos, notas, vidas y controles direccionales. Animación visual por fotograma; el envío de controles continúa limitado a intervalos de 100 ms.
- La animación del dado respeta la preferencia de movimiento reducido.

## Diferencias que permanecen

- Los 18 minijuegos existen y tienen reglas distintas, pero sus escenarios, objetos y física son adaptaciones HTML5. Los iconos corregidos no sustituyen los gráficos originales ni constituyen un port del ActionScript.
- Los recorridos del tablero y los fotogramas de personajes proceden de los archivos originales. La composición del HUD, los controles y la presentación de tienda, trivia y resultados siguen siendo propias del remake.
- El audio combina música original y efectos sintetizados. No reproduce todos los efectos y transiciones de Flash.
- El recorrido introductorio y el zoom son aproximaciones. Hace falta una comparación visual en navegador para ajustar encuadre, escala y tiempos contra el original.

## Verificación

`npm run typecheck`: correcto. `npm test`: 51 pruebas correctas, incluida una nueva comprobación de caras individuales, suma y espera antes del movimiento con dado triple.

`npm run build` y el arranque de Chromium no pudieron completarse: este entorno devuelve `spawn EPERM`. No se ha verificado visualmente el resultado ni se afirma equivalencia exacta con Flash.
