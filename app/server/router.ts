import {
  getAllPosts,
  getPost,
  createPost,
  deletePost,
  updatePost,
} from "./../controllers/postsController.ts"
import { ensureFile} from "https://deno.land/std@0.222.1/fs/mod.ts";

import { Hono, Context} from 'https://deno.land/x/hono/mod.ts'
import { serveStatic } from 'https://deno.land/x/hono/middleware.ts'
import { isNull } from "./../common/util.ts"
import { xdgLikeOpen } from "./util.ts"

import { posts} from "./StoredPosts.ts";



export const routes = (app: Hono) => {
  app.get("/", Page)
  app.get("index.bundle.js",
     Script);

  app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))

  app.get("/posts", getAllPosts)
  app.get("/posts/:key", getPost)
  app.post("/posts", createPost)
  app.put(
    "/posts/:key",
    updatePost,
  )
  app.delete("/storage/:key", deletePost)

  app.get("/storage/globalsearch/:keyword", GetGlobalSearchRequest)
  app.get("/storage/blob/:first/:second/:third/:file", GetStorageBlobResource)
  app.get("/storage/org/:first/:second/:third/:file", GetStorageOrgResource)
  app.get("/storage/meta/:first/:second/:third/:file", GetStorageMetaResource)
  app.get("/remote-xdg-like-open/storage/:type/:first/:second/:third/:file", RemoteOpenFile)
  app.get('*', FallbackResponse)

};

const FallbackResponse = (c: Context): Response => {
  console.log(`FallbackResponse Request( ${c.req.method}:${c.req.url} )`)
  return new Response(
    JSON.stringify( undefined),
    {
      status: 500,
      headers: {
        "content-type": "application/json",
    },
  });
  //return serveStatic({ path: './static/fallback.txt' })
}

export const RemoteOpenFile = async (c: Context) => {
  console.log(`RemoteOpenFile Request( ${c.req.method}:${c.req.url} )`)

  let filePath = `storage/${c.req.param("type")}/${c.req.param("first")}/${c.req.param("second")}/${c.req.param("third")}/${c.req.param("file")}`

  switch (c.req.param("type"))
  {
    case "org": {break;}
    case "meta": {break;}
    case "blob": {break;}
    case "project":
      {
        // 対象のフォルダがなければ作ってしまう
	      	try {
	       		await Deno.stat(filePath);   
	       	} catch (e) {
            // 対象のパスになにも存在しない時はとりあえず中間dir+index.mdを作る
            await ensureFile(`${filePath}/index.md`)
	       	}
          // 直接対応するindex.mdを開くために、末尾に追加する
          filePath = filePath+"/index.md"
        break;
      }
    default:
      {
        console.log(`想定外のtype:${c.req.param("type")}がリクエストされています`)
        break;
      }
  }

  const localPath = filePath
  xdgLikeOpen(localPath)
  return new Response(
    "success",
    {
      status: 200,
      headers: {
      }
    }
  )
}

/**
 * ストレージを全探索する
 * @param c 
 */
export const GetGlobalSearchRequest = async(c: Context) => {
  console.log(`GetGlobalSearchRequest ( ${c.req.method}:${c.req.url} )`)
  const searchKeyword = c.req.param("keyword")

  // 一度全て取得する
  await posts.fetchAll()

  // メタ情報に探索対象が含まれている集合を取得する
  const searchResult = await posts.toArray().
    filter(e=> {
      const json = JSON.stringify(e)
      return json.indexOf(searchKeyword) != -1
    })

  return new Response(
    //new TextDecoder("utf-8").decode(await Deno.readFile(filePath)),
    JSON.stringify( searchResult),
    {
      status: 200,
      headers: {
        "content-type": "text/json; charset=UTF-8",
      }
    }
  )
}

export const GetStorageBlobResource = async(c: Context) => {

  console.log(`GetStorageBlobResource Request( ${c.req.method}:${c.req.url} )`)

  const filePath = `storage/blob/${c.req.param("first")}/${c.req.param("second")}/${c.req.param("third")}/${c.req.param("file")}`
  
  // metaをとりあえずよんでcontent-typeを読む
  let binary: Uint8Array | undefined
  try {
    binary = await Deno.readFile(filePath)
  } catch (e) {
    // エラーレスポンス
    console.error(e)
    return failResponse()
  }
  if (isNull(binary)) {
    return failResponse()
  }

  //const spFilename = splitFileName(req.url)
  // 雑にリクエストパスからファイル名をとりだす
  const filename = c.req.url.split('/').pop() ?? "これがファイル名になっている場合はやばい"
  const file = new File([binary.buffer], filename)

  return new Response(
    binary,
    {
      status: 200,
      headers: {
        "content-type": `${file.type}; charset=UTF-8`,
      },
    },
  )
}

export const failResponse = () => {
  return new Response(
    JSON.stringify(undefined),
    {
      status: 500,
      headers: {
        "content-type": "application/json",
      },
    },
  )
}

const GetStorageOrgResource = async(c: Context) => {
  console.log(`GetStorageOrgResource Request( ${c.req.method}:${c.req.url} )`)
  const filePath = `storage/org/${c.req.param("first")}/${c.req.param("second")}/${c.req.param("third")}/${c.req.param("file")}`
  return new Response(
    new TextDecoder("utf-8").decode(await Deno.readFile(filePath)),
    {
      status: 200,
      headers:{
        "content-type": "text/plain; charset=UTF-8",
      },
    }
  )
}

const GetStorageMetaResource = async(c: Context) => {
  console.log(`GetStorageMetaResource Request( ${c.req.method}:${c.req.url} )`)
  const filePath = `./storage/meta/${c.req.param("first")}/${c.req.param("second")}/${c.req.param("third")}/${c.req.param("file")}`
  return new Response(
    new TextDecoder("utf-8").decode(await Deno.readFile(filePath)),
    {
      status: 200,
      headers: {
        "content-type": "text/json; charset=UTF-8",
      }
    }
  )
}

const Script = async (c: Context): Promise<Response> => {
  console.log(`Script Request( ${c.req.method}:${c.req.url} )`)
  return new Response(
    new TextDecoder("utf-8").decode(await Deno.readFile("app/editorPage/index.bundle.js")),
    {
      status: 200,
      headers: {
        "content-type": "text/javascript; charset=UTF-8",
    },
  });
}



const Page = async (c: Context): Promise<Response> => {
  console.log(`Page Request( ${c.req.method}:${c.req.url} )`)
  return new Response(
    new TextDecoder("utf-8").decode(await Deno.readFile("app/editorPage/index.html")),
    {
    status: 200,
    headers: new Headers({
      "content-type": "text/html; charset=UTF-8",
    }),
  });
};
