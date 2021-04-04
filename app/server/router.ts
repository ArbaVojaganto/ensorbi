import {
  createRouter,
  contentTypeFilter,
  ServerRequest,
} from "./deps.ts"
import {
  getAllPosts,
  getPost,
  createPost,
  deletePost,
  updatePost,
} from "./../controllers/postsController.ts"

import { isNull, splitFileName } from "./../common/util.ts"
import { xdgLikeOpen } from "./util.ts"


export const routes = () => {
  const router = createRouter()
  router.get("/", Page)
  router.get("index.bundle.js",
    Script);

  router.get("posts", getAllPosts)
  router.get(new RegExp("^posts/(.+)"), getPost)
  router.post("posts", createPost)
  router.put(
    new RegExp("^posts/(.+)"),
    updatePost,
  )
  router.delete(new RegExp("^posts/(.+)"), deletePost)

  router.get(new RegExp("^storage/blob/(.+)"), GetStorageBlobResource)
  router.get(new RegExp("^storage/org/(.+)"), GetStorageResource)
  router.get(new RegExp("^remote-xdg-like-open/(.+)"), RemoteOpenFile)

  return router;
};

const RemoteOpenFile = async (req: ServerRequest) => {
  console.log(req.url)
  const localPath = req.url.replace('/remote-xdg-like-open/', '')
  xdgLikeOpen(localPath)
  await req.respond({
    status: 200,
    headers: new Headers({
    }),
    body: "success"
  })
}

const GetStorageBlobResource = async(req: ServerRequest) => {
  console.log(req.url)
  // metaをとりあえずよんでcontent-typeを読む
  let binary: Uint8Array | undefined
  try {
    binary = await Deno.readFile(req.url.substring(1))
  } catch (e) {
    // エラーレスポンス
    console.error(e)
    return failResponse(req)
  }
  if (isNull(binary)) {
    return failResponse(req)
  }

  //const spFilename = splitFileName(req.url)
  // 雑にリクエストパスからファイル名をとりだす
  const filename = req.url.split('/').pop() ?? "これがファイル名になっている場合はやばい"
  const file = new File([binary.buffer], filename)

  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": `${file.type}; charset=UTF-8`,
    }),
    body: binary
  })
}

const failResponse = async(req: ServerRequest) => {
  await req.respond({
    status: 500,
    headers: new Headers({
      "content-type": "application/json",
    }),
    body: JSON.stringify(undefined)
  })
}

const GetStorageResource = async(req: ServerRequest) => {
  console.log(req.url)
  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": "text/plain; charset=UTF-8",
    }),
    body: new TextDecoder("utf-8").decode(await Deno.readFile(req.url.substring(1)))
  })
}

const Script = async (req: any) => {
  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": "text/javascript; charset=UTF-8",
    }),
    //body: new TextDecoder("utf-8").decode(await Deno.readFile("app/index.bundle.js"))
    body: new TextDecoder("utf-8").decode(await Deno.readFile("app/editorPage/index.bundle.js"))
  });
}

const Page = async (req: any) => {
  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=UTF-8",
    }),
    //body:new TextDecoder("utf-8").decode(await Deno.readFile("app/index.html"))
    body:new TextDecoder("utf-8").decode(await Deno.readFile("app/editorPage/index.html"))
  });
};
