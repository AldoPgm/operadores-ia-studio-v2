# Estado de la integración de modelos

Revisión documental: 29 de septiembre de 2026. Las páginas enlazadas documentan disponibilidad y esquema; no prueban acceso con la cuenta de Aldo. Todos los modelos instalados siguen visibles mientras se verifica su comportamiento real.

| Operación | Documentación contrastada | Estado |
| --- | --- | --- |
| Seedance 2.5 texto a video | [Referencia](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference) | Endpoint, prompt, duración 4–30, resolución 480p/720p/1080p, aspecto, audio y formato mapeados. Sin prueba con clave. |
| Seedance 2.5 imagen a video | [Referencia](https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video/api-reference) | `image_url`, `end_image_url` y parámetros comunes mapeados. Sin prueba con clave. |
| Seedance 2.5 referencias a video | [Referencia](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference) | Arrays de imágenes, videos y audio y parámetros comunes mapeados. Sin prueba con clave. |
| Soul 2 texto a imagen | [Referencia](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference) | Endpoint, prompt, lote, resolución, aspecto y mejora de prompt mapeados. Sin prueba con clave. |
| Soul 2 imagen a imagen | [Referencia utilizada en v1](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/api-reference) | Modelo conservado en el selector. La página no respondió en esta revisión; endpoint y esquema siguen sin verificar en v2. Sin prueba con clave. |

En las páginas de Seedance 2.5, la tabla de parámetros muestra `output_format`, mientras algunos fragmentos de código muestran `bitrate_mode`. La app sigue la tabla de parámetros y no manda `bitrate_mode`. Falta verificar esa discrepancia con una solicitud real. Los demás modelos del catálogo oficial instalado no se filtraron; sus mapeos y el acceso de la cuenta siguen sin verificar individualmente.

La integración usa [autenticación](https://docs.higgsfield.ai/docs/authentication), [polling](https://docs.higgsfield.ai/docs/concepts/polling), [uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads), [errores/reintentos](https://docs.higgsfield.ai/docs/concepts/errors) e [idempotencia](https://docs.higgsfield.ai/docs/concepts/idempotency) de la documentación compartida. La interfaz acepta la clave completa copiada de la plataforma en un solo campo, como pidió Aldo. El texto de autenticación muestra sus partes como `KEY_ID:KEY_SECRET`; la app no intenta separarlas y envía exactamente el valor pegado detrás de `Authorization: Key`.
