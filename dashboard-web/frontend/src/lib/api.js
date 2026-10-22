/**
 * Todo lo que habla con la API.
 *
 * Las rutas son relativas (`/api/...`): en desarrollo el proxy de Vite las
 * reenvia al backend, y en produccion Express sirve la pagina y la API desde
 * el mismo dominio.
 */

export class ErrorApi extends Error {
  constructor(estado, cuerpo) {
    super(cuerpo?.error || `Error ${estado}`);
    this.estado = estado;
    this.codigo = cuerpo?.codigo || null;
    this.cuerpo = cuerpo || {};
  }
}

/**
 * fetch con JSON a la ida y a la vuelta. Si la red falla, lanza un ErrorApi
 * con estado 0 para que la pantalla diga "Revisa tu conexion".
 */
export async function pedir(ruta, { metodo = "GET", cuerpo, signal } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      signal,
      headers: cuerpo !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ErrorApi(0, { error: "Sin conexión" });
  }
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, datos);
  return datos;
}

/**
 * Descarga un archivo de la API (PDF o CSV): fetch -> blob -> enlace temporal.
 * Devuelve el nombre con que se guardo, para el aviso de confirmacion.
 */
export async function descargar(ruta, nombrePorDefecto) {
  let respuesta;
  try {
    respuesta = await fetch(ruta);
  } catch {
    throw new ErrorApi(0, { error: "Sin conexión" });
  }
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, await respuesta.json().catch(() => ({})));

  const disposicion = respuesta.headers.get("Content-Disposition") || "";
  const nombre =
    respuesta.headers.get("X-Nombre-Archivo") ||
    /filename="([^"]+)"/.exec(disposicion)?.[1] ||
    nombrePorDefecto;

  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Safari necesita que el blob siga vivo un momento despues del clic.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return nombre;
}

/** Arma un query string ignorando lo vacio. Los arreglos se repiten (banco=a&banco=b). */
export function query(parametros) {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor === undefined || valor === null || valor === "") continue;
    for (const v of [].concat(valor)) p.append(clave, v);
  }
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

/** El texto que ve Gloria cuando algo falla, segun el tipo de error. */
export function mensajeDeError(error, accion = "cargar") {
  if (error?.estado === 0) {
    return accion === "guardar"
      ? "No pudimos guardar. Revisa tu conexión e intenta de nuevo."
      : "No pudimos cargar los datos. Revisa tu conexión.";
  }
  if (error?.codigo === "sin-migrar") return "Esta parte todavía no está lista. Avísale a quien te ayuda con el sistema.";
  return accion === "guardar"
    ? "No pudimos guardar. Intenta de nuevo en un momento."
    : "No pudimos cargar los datos. Intenta de nuevo en un momento.";
}
