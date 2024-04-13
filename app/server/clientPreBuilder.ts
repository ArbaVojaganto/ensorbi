import { bundle } from "https://deno.land/x/emit/mod.ts";


export const clientPreBuild = async () => {

  const url = new URL(import.meta.resolve("./../editorPage/index.ts"));
  const { code } = await bundle(url);

  //テキストエンコードを作成
  const encoder = new TextEncoder();

  // 書き込むファイルを指定
  const data = encoder.encode(code);

  // 上書きで書き込み なければ作成
  // ここで指定するパスはdeno.json相対のパスっぽい
  await Deno.writeFile("./app/editorPage/index.bundle.js", data);

}