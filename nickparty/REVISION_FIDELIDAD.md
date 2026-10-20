# Revisión de Block Party — 19 de octubre de 2026

Comparación con el SWF local ejecutado en Ruffle, sus instrucciones en `../content/www.funkypotato.com/gamez/nick-block-party/xml/translation.xml` y sus bitmaps. Capturas: `screenshots/original` y `screenshots/gameplay`. Cambios locales en `nickparty`, sin publicar.

| Elemento | Original / problema del remake | Corrección |
| --- | --- | --- |
| Dado | Se lanza dentro del escenario; el remake lo separaba. | Botón y animación sobre el tablero, caras individuales y espera antes del movimiento. |
| Personajes y casillas | El tamaño fijo tapaba el mapa. El original usa casillas redondas con borde crema. | Tamaño relativo al mapa, separación proporcional al compartir casilla, profundidad por posición y casillas que escalan con el zoom. |
| Monedas | Giro, regalo inicial de 10, casillas de +5 y −5. | Sprite de 24 fotogramas, partículas de ganancia/pérdida, contador animado, recompensas reales, saldo inicial y leyendas corregidos. |
| Minijuegos | Escenarios genéricos e iconos sin la identidad original. | Fondos y objetos extraídos para los 18 minijuegos. Inventario reproducible en `public/assets/minigames/sources.json`. |
| Teclado | Movimiento sostenido y acciones específicas. | WASD/flechas, Espacio, liberación al perder foco, bloqueo durante instrucciones/resultados. Yo Running Race requiere alternar direcciones. |
| Celular | El original Flash usa teclado y ratón. | Cruceta, selección y arrastre, deslizamiento en hockey, objetivos táctiles de al menos 44 px, distribución vertical/horizontal y movimiento más salto con dos dedos. |
| Participantes | El original permite tres; el remake hasta ocho. | Marcador desplazable, casilleros propios más rival seleccionable, carriles y tarjetas para ocho. Misma secuencia de medusas y distractores para cada bandera. |
| Duración | Opciones originales de 10, 15 o 20 turnos. | Añadidas junto con las partidas cortas del remake. |
| Inicio | Fallo al interpolar un fotograma anterior al instante de inicio. | Tiempo acotado, cancelación de efectos desmontados y salida de seguridad de la introducción. |

## Diferencias que permanecen

Se recuperó el arte, no se portó todo el ActionScript. La física, los tiempos, las recompensas por puntuación y la inteligencia de CPU siguen siendo adaptaciones. El hockey adapta la pista al número de participantes y asigna una portería independiente a cada jugador, hasta ocho; cada cámara sitúa la portería propia abajo. El laberinto usa una cuadrícula propia; Pizza Pursuit y Jelly Bubble combinan objetos originales con fondos dibujados en código. Controles, tienda, trivia y resultados tienen composición propia. No se afirma equivalencia exacta con Flash.

## Verificación

- `npm run typecheck`, `npm test` y `npm run build`: correctos; 72 pruebas de reglas, simulación, partidas, recursos y red.
- `npm run check:gameplay-ui`: dado integrado, escala, WASD/flechas/Espacio, 21 escenarios con ocho participantes, recursos cargados y ausencia de errores de navegador.
- Emulación táctil de Chromium en 390×844, 320×568 y 844×390: pulsación sostenida, liberación, dos dedos, pulgas/cubos, comida/cabra, casilleros y medusas en movimiento. Revisa botones, instrucciones y resultados.
- Monedas: saldo inicial sin recompensa ficticia, incremento, pérdida, oro, contador, expiración de partículas, ausencia de duplicación y movimiento reducido.
- El catálogo se recorre con el componente real y la simulación del servidor en un montaje de prueba. El inicio y la tirada se prueban contra la sala local. La emulación no sustituye probar un teléfono físico ni Safari de iOS.

Para regenerar imágenes: `python -m pip install Pillow` y `python scripts/extract-minigame-media.py`. `--refresh` fuerza la extracción. Los intermedios quedan en `.asset-extraction`, fuera de Git.


## Segunda revisión: salto, dificultad y nuevos minijuegos

- **Pizza Pursuit y Yo Running Race:** trayectoria parabólica compartida entre cliente y servidor. La sombra permanece en el suelo y el personaje sube en el eje vertical, sin interpolación que amortigüe el salto. La colisión se evalúa a la altura del personaje en el instante exacto en que cruza el obstáculo. Saltar demasiado pronto o tarde causa golpe; un salto correcto muestra «Salto limpio». Los obstáculos varían de altura y llegan cada vez más rápido. El jugador local ocupa el carril principal.
- **Apartment Maze:** generación determinista de 13×11 casillas por partida, dos llaves obligatorias y salida cerrada hasta recogerlas. El mapa se muestra durante los primeros 2,2 segundos; después se reduce la visibilidad alrededor del jugador y se conserva el rastro explorado. Duración de 45 segundos. Se comprobaron conectividad y resolución en 80 semillas distintas.
- **Music Drop / King of the Heap:** aumenta la frecuencia y velocidad de caída. Music Drop incorpora notas rojas que restan puntos; los golpes tienen respuesta visual.
- **Hockey:** el tamaño y posición visibles de las barras coinciden con el área de devolución utilizada por el servidor.
- **CPU:** las acciones de selección de pulgas, comida y casilleros tienen tiempo de reacción; los saltos de carreras y espátula y el rebote de cama usan las señales temporales del juego.
- **Islas de color:** alcanzar el color y símbolo anunciado antes de que desaparezcan las demás plataformas. Cambian las posiciones seguras y disminuye el tiempo para reaccionar.
- **Semáforo tramposo:** correr manteniendo una dirección, soltar al aparecer la advertencia y permanecer quieto en rojo. Moverse en rojo hace retroceder y aplica una pausa breve. La CPU sigue las mismas fases.
- **Tesoro bajo fuego:** recoger monedas de uno o tres puntos mientras ondas expansivas recorren la arena. Saltar evita la pérdida de tres puntos por golpe.

Los tres nuevos juegos se incorporan a la selección aleatoria sin repeticiones de la partida. Son mecánicas propias de juego de fiesta; no se añadieron personajes ni recursos gráficos de Mario.

La comprobación visual mide también la separación real entre personaje y sombra durante el salto y su regreso al suelo. El catálogo completo pasó escritorio, 390×844, 320×568 y 844×390 con ocho participantes. Las pruebas de reglas distinguen salto correcto, temprano, tardío y ausencia de salto; comprueban llaves obligatorias, plataformas seguras variables, penalización del semáforo y ondas de choque.


## Inicio y animaciones

Selección con ocho tarjetas identificadas, pedestal animado, encuadre de las siluetas a partir de sus máscaras originales, estado seleccionado visible y navegación por teclado. En celular se compacta la vista del personaje y se conservan objetivos de al menos 44 px. La sala muestra sus ocho plazas.

Se corrigió el parpadeo al cerrar la animación: las imágenes y sus máscaras permanecen montadas y se alternan mediante opacidad tras decodificar los recursos. La regresión visual analizó 72 capturas de ocho personajes a lo largo de varios ciclos, sin desapariciones. `check:home-ui` y `check:gameplay-ui` pasaron tras este cambio.

La verificación de red usa ocho WebSockets reales contra una autoridad local. Los 21 minijuegos reciben acciones de todos y publican estados idénticos a los ocho clientes. Una prueba sostenida entrega las 160 acciones a cada participante sin desconexión; también se comprueban límite de plazas y reconexión. Las simulaciones completas y capturas móviles complementan esa prueba, sin sustituir una partida entre ocho teléfonos físicos.


## Dificultad progresiva y correcciones de salto

La espátula usa un reloj compartido por dibujo, colisión y CPU: empieza con vueltas de 3000 ms y acelera 220 ms por vuelta hasta un mínimo de 1000 ms. La primera vuelta conserva la preparación. La colisión usa la altura en el instante de paso, aunque el siguiente tick llegue después del aterrizaje.

Jelly Bubble programa 26 apariciones por bandera, con el mismo orden para todos. Los intervalos bajan de 1550 a 550 ms y la velocidad pasa de 12 a 30 unidades por segundo. La posición visual se interpola con el mismo reloj, sin saltos de 100 ms. Una distractora solo puede quitar una vida una vez; las medusas capturadas dejan de interceptar toques y desaparecen tras la burbuja.

Los fotogramas de salto siguen la fase de vuelo una sola vez, sin reiniciar la pose en el aire. El encuadre de las poses originales se ajusta a la escala y punto de apoyo del reposo. Se separó el carril local de los siete rivales y se ajustó el círculo de la espátula y la altura máxima de las camas para evitar recortes en el borde superior.

`node scripts/check-difficulty-ui.mjs` comprueba el punto alto de los saltos en cuatro minijuegos con ocho personajes, separación de carriles y mayor densidad de medusas al final, tanto en escritorio como en 390×844. Se complementa con las 72 pruebas, la compilación y la revisión general de los 21 minijuegos.


## Personajes adicionales y Escape Oom

Se incorporaron Jovany, Luna, Marfileño y Yocsan junto a Martín mediante importación por carpeta, sin modificar los originales. La selección muestra 13 personajes, con ocho plazas de partida. Se probaron todas las acciones de sustitución de los cinco personalizados, la selección en 1440/390/320 y 72 capturas de los 13 personajes sin desapariciones. La prueba de ocho sockets incluye a los cinco personalizados en los 21 minijuegos.

Escape Oom tiene tres posiciones fijas del enemigo, aviso luminoso, preparación, extensión suave, barrido de lengua sobre el carril y retirada. Se usan poses frontales originales con encuadre común. Los ataques aceleran de 3,2 a 1,5 segundos por ciclo; cambian de carril y conservan un mínimo de 1,2 segundos hasta el golpe. Las colisiones y la CPU usan el mismo reloj que el dibujo. Los saltos no forman parte de los controles de Escape Oom y se rechazan tanto en cliente como en servidor.

Se verificaron las fases del ataque y su aceleración con pruebas de reglas y capturas de escritorio y móvil con ocho participantes. La suite completa tiene 72 pruebas y la compilación es correcta.
