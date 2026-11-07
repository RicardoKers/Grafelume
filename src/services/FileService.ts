export function downloadText(text: string, filename = "grafelume.txt"): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  document.body.append(link);
  link.click();
  link.remove();
  // Allow the browser to consume the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readTextFile(file: File): Promise<string> {
  if (!/\.txt$/i.test(file.name))
    throw new Error("Escolha um arquivo de texto com extensão .txt.");
  try {
    if (typeof file.text === "function")
      return (await file.text()).replace(/^\uFEFF/, "");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(String(reader.result ?? "").replace(/^\uFEFF/, ""));
      reader.onerror = () =>
        reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsText(file, "UTF-8");
    });
  } catch {
    throw new Error(
      "Não foi possível ler o arquivo. Verifique se ele está disponível e em UTF-8.",
    );
  }
}
