# Operadores IA Studio v2

App local de Operadores IA para crear imágenes y videos con los modelos instalados de la API de Higgsfield. Cada persona conecta su propia clave desde **Connect API key**. La clave completa se guarda en una cookie HTTP-only; las llamadas autenticadas salen del servidor.

## Probarla

1. Instalá Node.js 22.15 o posterior y pnpm.
2. En esta carpeta, ejecutá `pnpm install`.
3. Ejecutá `pnpm setup`. Crea `.env.local` con la URL de Higgsfield y una clave de cifrado aleatoria del servidor.
4. Ejecutá `pnpm dev` y abrí la URL local que indique la terminal.
5. Hacé clic en **Connect API key** y pegá la clave completa copiada de [open.higgsfield.ai/api-keys](https://open.higgsfield.ai/api-keys). No agregues el prefijo `Key`.
6. Elegí imagen o video, un modelo, escribí un prompt y ajustá duración, resolución o cantidad de imágenes. También podés subir referencias compatibles con el modelo.
7. Esperá a que aparezca el precio estimado en USD junto a **Generate**. Se actualiza solo después de escribir o cambiar un ajuste. Con el precio visible, un clic en **Generate** envía el trabajo.

La estimación usa el endpoint `/estimate/<modelo>` con los mismos parámetros que se enviarían para generar. La consulta espera una breve pausa al escribir para no llamar a la API por cada tecla. Si Higgsfield no devuelve un precio en USD, aparece **Precio N/D** y se puede generar igual. El cargo final lo determina Higgsfield.

La app muestra estados, errores y resultados, permite cancelar solicitudes elegibles y conserva el historial y los proyectos en este navegador. El historial no se sincroniza entre dispositivos. Guardar una clave no comprueba que sea válida; una solicitud a la API confirma el acceso.

La clave de API se cifra antes de guardarse en una cookie HTTP-only. La clave de cifrado `HF_COOKIE_SECRET` queda solo en el servidor y nunca se sube a Git. Si desplegás la app, configurá `HF_API_BASE_URL` y una `HF_COOKIE_SECRET` de 32 bytes en base64url como variables privadas del servidor. Si cambiás ese secreto, cada persona tendrá que volver a conectar su clave de API. Las cookies anteriores en texto claro se eliminan cuando se abre la app actualizada.

La clave que cada persona pega necesariamente viaja a **este servidor** y desde él a Higgsfield. Por eso, quien aloje la app debe ser de confianza y usar HTTPS. El repositorio público contiene código, no una app publicada. Antes de exponer una instancia a terceros, agregá límites de solicitudes y control de acceso adecuados al alojamiento elegido.

## Verificación

`pnpm models` regenera el catálogo. `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build` verifican el proyecto. No hace falta editar `generation/catalog/models.generated.ts` a mano.

Los modelos instalados permanecen en los selectores de imagen y video. Los endpoints y parámetros de Seedance 2.5 y Soul 2 usados en los ejemplos se contrastaron con las páginas actuales de Higgsfield. No se hizo una generación real sin una clave de la cuenta. [Detalle de verificación](MODEL_STATUS.md).

Las vistas previas de los presets son imágenes originales. Sus [prompts y archivos](ASSET_PROMPTS.md) quedan documentados en el proyecto.

## Arquitectura

Next.js 16 y React 19. Las acciones de `generation/actions.ts` envían y cancelan en la API; `app/api/upload/route.ts` pide URLs firmadas para referencias. El navegador sube el archivo a esa URL con los headers devueltos, sin mandar la clave al almacenamiento. Los resultados y proyectos se guardan localmente en IndexedDB.

La protección de envíos duplicados usa un ID por intento en la interfaz, una guarda del proceso servidor y el header `Idempotency-Key` de Higgsfield. Este último mantiene la misma intención de generación incluso si la app corre en varias instancias. Ante un envío de resultado incierto, la app avisa y no repite automáticamente el POST.
