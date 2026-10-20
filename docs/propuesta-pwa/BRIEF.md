# Brief para Claude Code: mejoras de UI/UX y rendimiento en la PWA "Rewards Visitas"

> Lee este documento completo antes de tocar cualquier archivo.
> Las imágenes de referencia están en esta misma carpeta (`docs/propuesta-pwa/`).

---

## 0. Cómo trabajar (obligatorio)

1. **Fase 0 es solo lectura.** No modifiques ningún archivo hasta que yo apruebe el plan.
2. Trabaja **una fase a la vez**. Al final de cada fase:
   - el proyecto compila sin errores (`npm run build`) y pasa el lint, si existe;
   - me dices qué archivos cambiaste, qué hace cada cambio y cómo probarlo en el celular;
   - haces un commit con un mensaje claro en español (`feat(pwa): fase 1 - login ...`).
3. **No rompas la comunicación con el backend.** La PWA habla con Google Apps Script (`doPost` en `Api.gs`). No cambies nombres de acciones, parámetros ni el formato del token.
4. **No modifiques el backend desde aquí.** Si una mejora necesita un cambio en Apps Script, entrégame el código `.gs` en un bloque aparte, marcado **"REQUIERE CAMBIO EN APPS SCRIPT"**. Yo lo pego y lo despliego.
5. **No inventes datos.** Si una pantalla de la propuesta muestra algo que el backend no entrega hoy (distancia, meta mensual, tipo de incidencia, etc.), avísame y propón una alternativa. No pongas valores fijos de ejemplo.
6. Todos los textos visibles van en **español (Perú)**, con el tono de las imágenes.
7. No agregues librerías pesadas sin preguntarme. Prefiere lo que ya usa el proyecto.
8. Nunca subas contraseñas, tokens ni URLs secretas al repositorio.

---

## 1. Contexto del sistema

- **Usuarios de la PWA:** capacitadores de campo (CAPs). Visitan comercios (locales) afiliados al programa Rewards en Lima.
- **Arquitectura:**
  - Desktop (Admin/KAM): Apps Script `desktop.html` → `api(token, accion, args)` → `Seguridad.gs` (token HMAC y roles).
  - Móvil (CAPs): esta PWA (Next.js en Vercel) → `doPost` de Apps Script (`Api.gs`).
  - Ambos usan la hoja de Google **OPERACIONES**.
- **Catálogo de locales:**
  - `id_local`: `PC-xxxx` = puerta calle, `CC-xxxx` = centro comercial.
  - Campos: marca, dirección, distrito, mall, KAM, PSI, puntos BBVA.
  - **No hay coordenadas (lat/lng).**
- **Columnas que guarda una visita (`visitas_2026`):**
  - Marca temporal, CAP, correo, KAM, Motivo, Nombre del comercio, Centro comercial o puerta calle, Dirección.
  - Beneficios activos, Procesador [POS], códigos OPENPAY, NIUBIZ e IZIPAY.
  - Material POP, Personal que atendió, Celular, Status, Observaciones adicionales, Fotos o videos, id_local.
- **Motivos:** Visita · Branding · Capacitación Presencial · Capacitación Virtual (esta última tiene enlace de Meet).
- **Status:** Todo Ok · Incidencia · Reprogramar · No existe.
- **Aviso de incidencias:** ya está listo en el backend (`notificarSegunStatus_`), pero apagado. Si una incidencia avisa o no al KAM depende de la configuración del backend. La PWA solo debe mostrar ese mensaje si el backend confirma que el aviso se envió.
- **Colores de marca:**

  | Uso | Color |
  |---|---|
  | Primario | `#3D35C8` |
  | Primario claro | `#EEEDFE` |
  | Primario medio | `#6C63E8` |
  | Verde (Todo Ok) | `#16A34A` |
  | Rojo (Incidencia) | `#DC2626` |
  | Ámbar (Reprogramar) | `#D97706` |
  | Gris (No existe) | `#64748B` |
  | Lila (Capacitación) | `#9333EA` |

  Íconos: Tabler Icons.

---

## 2. Fase 0: leer todo y planificar (solo lectura)

Recorre **todo** el repositorio y entrégame:

1. **Mapa del proyecto:** carpetas, páginas y rutas, componentes, estilos y estado global.
2. **Conexión con el backend:**
   - URL y cómo se configura;
   - lista de acciones que se llaman y qué devuelve cada una;
   - cómo se guarda el token y cuánto dura.
3. **Estado PWA:**
   - `manifest`;
   - service worker;
   - qué funciona sin conexión hoy;
   - cómo se suben las fotos (tamaño y formato).
4. Si existe `docs/backend-referencia/` con archivos `.gs`, léelos solo como referencia para entender qué devuelve el backend.
5. **Tabla de diferencias** entre lo que hay hoy y cada pantalla de la propuesta. Por cada diferencia, marca:
   - **solo frontend**;
   - **requiere backend**;
   - **no hay datos**.
6. **Plan por fases** (sección 3), con riesgos y las preguntas que necesites que yo responda.

Espera mi aprobación antes de pasar a la Fase 1.

---

## 3. Fases de implementación

### Fase 1: Login (mantener el diseño actual)
Referencia: `00_login_mejorado.png`.

**El login actual se queda igual:** logo, "¡Bienvenido!", campos, botón con degradado y pie de página. Solo se agrega lo siguiente.

- **Fila nueva bajo la contraseña:**
  - a la izquierda, casilla **"Mantener sesión iniciada"** (marcada por defecto);
  - a la derecha, enlace **"¿Olvidaste tu clave?"**.
- **"Mantener sesión iniciada":**
  - Marcada: guarda la sesión de forma persistente (`localStorage`) por **30 días**, y el usuario entra directo al abrir la app.
  - Desmarcada: guarda la sesión solo mientras la app esté abierta (`sessionStorage`).
  - Revisa cuánto dura el token que emite el backend. Si dura menos de 30 días:
    - propón cómo renovarlo, o
    - entrégame el cambio del backend marcado "REQUIERE CAMBIO EN APPS SCRIPT".
  - Si el token vence o el backend lo rechaza, vuelve al login con el usuario ya escrito y el mensaje "Tu sesión expiró, ingresa de nuevo".
- **"¿Olvidaste tu clave?":**
  - Abre un panel inferior (bottom sheet) que explica que el administrador restablece la clave.
  - El panel tiene dos botones: **"Escribir por WhatsApp"** (wa.me con un mensaje prellenado que incluye el usuario escrito) y **"Enviar correo"** (mailto).
  - El número y el correo del admin van en una constante de configuración o en una variable de entorno, no escritos en el componente.
  - No crees un flujo de recuperación automática.
- **Error de credenciales:**
  - mensaje rojo arriba de los campos;
  - no se borra el usuario;
  - el botón muestra "Ingresando…" y se desactiva mientras espera.
- **Accesibilidad:** las etiquetas de los campos son accesibles y el botón del ojo tiene `aria-label`.

### Fase 2: Pantalla "Hoy" (nuevo inicio)
Referencia: `02_hoy.png`, `A_entrada_y_ruta_del_dia.png`.

- **Saludo:** según la hora (Buenos días / tardes / noches), nombre del CAP y fecha larga.
- **Tarjeta de avance:** visitas hechas sobre el total del día, anillo de porcentaje y contadores por status.
- **"Siguiente visita"** (la primera pendiente por hora):
  - hora y tiempo que falta, comercio, mall o dirección, motivo, `id_local`;
  - botón **"Cómo llegar"**: abre Google Maps buscando por dirección o por mall + marca, porque no hay coordenadas;
  - botón **"Iniciar visita"**: abre el registro con el local ya cargado.
  - **No mostrar distancia en km** mientras no haya coordenadas.
- **"Ruta del día":** lista tipo línea de tiempo.
  - Las paradas hechas van atenuadas, con su status.
  - Las de Capacitación Virtual muestran un botón **"Unirse"** que abre su enlace de Meet. Si el enlace no trae `https://`, agrégalo.
- **Indicador de sincronización:** "Sincronizado" o "N pendientes de envío".
- **Barra inferior:** Hoy · Buscar · **Registrar** (botón central destacado) · Historial · Perfil.
- **Campana:** quítala si no tiene función. No dejes botones que no hacen nada.

### Fase 3: Buscar comercio y Detalle del local
Referencia: `07_buscar.png`, `03_detalle_local.png`.

**Buscar:**
- Busca desde la 2.ª letra, con espera de 300 ms entre teclas.
- Filtro **Todos / Puerta calle / C. comercial**.
- Resalta el texto que coincide.
- Muestra "En tu ruta hoy" si el local está asignado hoy, y "Sin visita hace N días" o "Incidencia abierta" si el backend lo entrega. Si no lo entrega, avísame.
- Guarda las últimas 5 búsquedas en el celular.

**Detalle del local:**
- Botones Llamar (`tel:`), WhatsApp (`wa.me`), Cómo llegar y Copiar dirección.
- Tarjeta de última visita: fecha, status, CAP y observación.
- Datos: POS, código, beneficios, material POP y contacto.
- Botón fijo abajo: **"Iniciar registro de visita"**.

### Fase 4: Registro de visita en 3 pasos
Referencia: `04_registro_paso1.png`, `05_registro_paso3.png`, `06_visita_guardada.png`, `B_registro_en_3_pasos.png`.

- **Paso 1 · Resultado:**
  - Motivo y Status con tarjetas grandes de 2 columnas.
  - Si el status es **Incidencia**, se pide el tipo con chips: POS no aplica beneficio · Falta material POP · Personal no capacitado · Local cerrado · Otro.
  - No hay columna para el tipo. Propón dónde guardarlo; mi sugerencia es anteponerlo a Observaciones: `[POS no aplica beneficio] ...`.
- **Paso 2 · Datos del local:**
  - contacto, celular, procesador POS, códigos, beneficios y material POP;
  - **todo prellenado con la última visita del local**, para que el CAP solo corrija lo que cambió.
- **Paso 3 · Evidencia:**
  - **"Tomar foto"** (cámara directa) y **"Galería"**;
  - miniaturas con botón para quitar;
  - observaciones con botón de dictado por voz (solo si el navegador lo soporta; si no, se oculta);
  - resumen antes de guardar.
- **Borrador automático:** cada cambio se guarda en el celular. Al volver, se ofrece "Continuar borrador".
- **Validaciones:**
  - Motivo y Status son obligatorios.
  - Celular: 9 dígitos que empiezan con 9.
  - Los errores se muestran junto al campo.
- **Confirmación:**
  - "¡Visita guardada!" y el avance actualizado;
  - botón **"Ir a la siguiente visita"**.
  - Solo menciona el aviso al KAM si el backend confirma que se envió.

### Fase 5: Sin conexión y rendimiento
- **Cola de envío:** si no hay señal, la visita se guarda en IndexedDB y se envía sola al volver la conexión. El reintento es automático y espera cada vez más entre intentos.
- **Evitar duplicados:** cada visita lleva un identificador único generado en el celular. Si el backend necesita ignorar repetidos, entrégame ese cambio marcado "REQUIERE CAMBIO EN APPS SCRIPT".
- **Avisos en pantalla:**
  - banner ámbar de **"Sin señal"** en el registro;
  - etiqueta **"Pendiente de envío"** en el historial.
- **Compresión de fotos** en el celular antes de subir: lado mayor 1600 px, JPEG con calidad 0.7 (aprox. 300–500 KB cada una).
- **Caché del día:** la ruta del día y los datos de esos locales quedan guardados para abrir al instante y funcionar sin señal.
- **PWA instalable:**
  - `manifest` completo (íconos, `theme_color #3D35C8`, `display: standalone`);
  - service worker que no rompa las actualizaciones;
  - aviso **"Hay una nueva versión, actualizar"** cuando corresponda.

### Fase 6: Historial, Perfil y modo oscuro
Referencia: `08_historial.png`, `09_perfil.png`, `10_hoy_modo_oscuro.png`, `C_historial_perfil_y_modo_oscuro.png`.

- **Historial:**
  - resumen de la semana con barras por día;
  - filtros con contador (Todas · Todo Ok · Incidencia · Reprogramar · No existe);
  - lista agrupada por día ("Hoy", "Ayer", "Viernes 16 oct").
- **Perfil:**
  - totales del mes;
  - estado de sincronización con botón para sincronizar;
  - tema Claro / Auto / Oscuro;
  - cerrar sesión, con confirmación.
  - La **meta mensual** no existe en el backend: ocúltala o pregúntame.
  - Quita las opciones que digan "Próximamente".
- **Modo oscuro:** colores definidos como variables y contraste AA.

---

## 4. Criterios de calidad (todas las fases)

- Se ve bien en **360 px, 375 px y 414 px** de ancho y respeta el notch (`safe-area-inset`).
- Botones y zonas táctiles de **44 px** como mínimo.
- Estados de carga (esqueletos), vacío y error en cada lista.
- Sin errores en consola. Lighthouse móvil: Performance ≥ 85, PWA instalable.
- Nada de código muerto ni botones sin función.

---

## 5. Imágenes de referencia

| Archivo | Pantalla |
|---|---|
| `00_login_mejorado.png` | Login actual + mantener sesión + olvidaste tu clave |
| `A_entrada_y_ruta_del_dia.png` | Resumen: Hoy, Buscar, Detalle |
| `B_registro_en_3_pasos.png` | Resumen: registro en 3 pasos |
| `C_historial_perfil_y_modo_oscuro.png` | Resumen: Historial, Perfil, Oscuro |
| `02_hoy.png` … `10_hoy_modo_oscuro.png` | Cada pantalla por separado |

Los nombres, horas y cifras de las imágenes son **de ejemplo**: usa siempre los datos reales del backend.
**Ignora `01_login.png`**: el login se mantiene como el actual (ver Fase 1).
