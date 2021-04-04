
import { Node} from "./../models/Node.ts"
import { ensureDir } from './deps.ts'
import { hashPath, metaPath, blobPath } from "./ConfigLoader.ts"

export const saveMeta = async(meta : Node) => {
  console.log(`save meta: ${meta.hash}`)
  console.log(meta)
  const saveHashPath = hashPath(meta.hash)
  const saveMetaPath = metaPath() + saveHashPath
  await ensureDir(saveMetaPath)
  await Deno.writeTextFile(saveMetaPath + meta.hash + ".json", JSON.stringify(meta))
}

export const saveBlob = async (hash: string, extention: string, uint8Array: Uint8Array) => {
  const filename = hash + extention
  console.log(`save blob: ${filename}`)
  const saveHashPath = hashPath(filename)
  const saveBlobPath = blobPath() + saveHashPath
  await ensureDir(saveBlobPath)
  await Deno.writeFile(saveBlobPath + filename,  uint8Array)
}


export const xdgLikeOpen = (uri: string) => {
  const { os } = Deno.build
  const cliArguments: string[] = [];
  let command = ""
  if ( os === 'darwin' ) {
      // macosよくわからんので必要になったら実装
      //throw(new Exception())
  } else if ( os === 'windows') {
      command = 'cmd'
      cliArguments.push('/s', '/c', 'start', '', '/b');
  
  } else {
      // macosでもwindowsでもなければとりあえずunixosだと判断する
  }

  cliArguments.push(uri);

  const runOptions: Deno.RunOptions = {
    cmd: [command, ...cliArguments],
    stdin: 'piped',
    stderr: 'piped',
    stdout: 'piped'
  }
  const subprocess = Deno.run(runOptions);
  console.log(runOptions)
}
