import {
  exists,
  copy,
  CopyOptions,
} from "https://deno.land/std/fs/mod.ts"

import { base64 } from "./../server/deps.ts"


const updateStorage = async(path: string) => {
  const opt: CopyOptions = { overwrite: true }
  console.log(`copy 'storage/' -> '${path}storage/')`)
  await copy('storage', path + 'storage', opt)
}

export const buildDenoDeployProject = async(path: string) => {
  // ファイルがなかったらコピーする
  if (!await exists(path + "index.html")) {
    console.log(`copy 'app/viewerPage/index.html' -> '${path}index.html')`)
    Deno.copyFile('app/viewerPage/index.html', path + 'index.html')
  }
  //if (!await exists(path + "index.bundle.js")) {
    console.log(`copy 'app/viewerPage/index.bundle.js' -> '${path}index.bundle.js')`)
    Deno.copyFile('app/viewerPage/index.bundle.js', path + 'index.bundle.js')
  //}

  await updateStorage(path)


  const header = `
  const html = \`

  `
  const hooter = `
\`
addEventListener("fetch", (event: any) => {
  event.respondWith(
    new Response(html, {
      status: 200,
      headers: {
        server: "denosr",
        "content-type": "text/html",
      },
    })
  );
});
    `

  // ビルド出力ディレクトリでmain.tsのバンドルを開始する

  // jsファイルをdatauriに変換
  const script = await Deno.readTextFile(path + "index.bundle.js")
  const uint8arr = new TextEncoder().encode(script)
  const b64 = base64.fromUint8Array(uint8arr)
  const dataUri = `data:text/plain;base64,${b64}`

  const baseHtml = await Deno.readTextFile(path + "index.html")
  let body = baseHtml.replace('<script src="index.bundle.js"></script>', `<script src="${dataUri}"></script>`)
  body = body.replaceAll('\`', '\\\`')
  body = body.replaceAll('\$', '\\\$')


  const html = header + body + hooter
  
  await Deno.writeTextFile(path + "main.ts", html)
}