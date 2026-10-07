export async function prepareImage(
  file: File,
): Promise<{ image: string; mimeType: string; preview: string }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "JPEG・PNG・WebP形式を選んでください。HEICの場合はJPEGに変換してから選んでください。",
    );
  if (file.size > 20 * 1024 * 1024)
    throw Error("20MB以下の写真を選んでください。");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(Error("写真を開けませんでした。別の写真を選んでください。"));
      img.src = objectUrl;
    });
    if (image.width * image.height > 60_000_000)
      throw Error("写真の解像度が大きすぎます。小さい写真で試してください。");
    const ratio = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("この端末で写真を変換できませんでした。");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.82);
    if (preview.length > 2_500_000)
      throw Error("写真を小さくしてから再度お試しください。");
    return { image: preview.split(",")[1], mimeType: "image/jpeg", preview };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
