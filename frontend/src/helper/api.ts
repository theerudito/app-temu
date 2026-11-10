import { Url_base } from "./UrlBase";

export const apiBaseUrl = `${Url_base.replace(/\/+$/, "")}/api/v1`;

export async function readJson(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    throw new Error(
      `La API respondió ${response.status} con ${contentType || "un tipo de contenido desconocido"} en ${response.url}. Verificá PUBLIC_API_URL y que la ruta apunte al backend.`,
    );
  }
  return response.json();
}
