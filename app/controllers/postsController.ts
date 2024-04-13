
import { BlobMeta } from "./../models/BlobMeta.ts"
import { TagMeta } from "./../models/tags.ts"
import { SymbolNode } from "./../models/SymbolNode.ts"
import { posts, StoredPosts, registerBlobMeta, registerTagMeta } from "./../server/StoredPosts.ts";
import { multiParser  } from './../server/deps.ts'
import { FormFile } from './../server/deps.ts'
import { getSingleOrArrayFirst } from './../common/util.ts'
import { Hono, Context} from 'https://deno.land/x/hono/mod.ts'
import { is } from "https://deno.land/x/unknownutil@v3.17.0/mod.ts";
import { getSignedCookie } from "https://deno.land/x/hono@v4.1.1/helper/cookie/index.ts";


export const getAllPosts = async (c: Context) => {
  await posts.fetchAll()
  return new Response(
    JSON.stringify( posts.toArray()),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
    },
  });
};

export const getPost = async (c: Context) => {

  console.log(`getPost Request( ${c.req.method}:${c.req.url} )`)

  const key = c.req.param("key");
  const ret: {[hash: string]: any} = {}
  ret[key] = await posts.fetch(key)

  return new Response(
    JSON.stringify( ret ),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
    },
  });
};

export const createPost = async (c: Context) => {

  console.log(`createPost Request( ${c.req.method}:${c.req.url} )`)

  const formBody = await c.req.parseBody()

  const failResponse = new Response(
    JSON.stringify( undefined),
    {
      status: 500,
      headers: {
        "content-type": "application/json",
    },
  });



  // メタファイルすらないリクエストは早期リターンする
  if (formBody==undefined || !formBody["meta"]) {
    return failResponse
  }
  if (formBody["meta"] == "{}") {
    return failResponse
  }

  let metaString = ""
  {
    const stringOrFile = getSingleOrArrayFirst(formBody["meta"])
    if (is.String(stringOrFile))
    {
      metaString = stringOrFile
    }
  }

  if (metaString == "") {
    throw("空文字列です")
  }

  const meta = JSON.parse(metaString)
  let fileDirty: File | null = null
  {
    const stringOrFile = getSingleOrArrayFirst(formBody["file"])
    if (is.String(stringOrFile)){
      throw("fileに文字列が指定されています")
    } else {
      fileDirty = stringOrFile
    }
  }
  if ( is.Nullish(fileDirty)) {
    return failResponse
  }

  const file = fileDirty

  let updateNodes = undefined
  if (BlobMeta.validation(meta)) {
    const uint8array = new Uint8Array(await file.arrayBuffer())
    // 新規登録
    updateNodes = await registerBlobMeta(
      uint8array,
      meta
    );

  } else if (TagMeta.validation(meta)) {
    updateNodes = await registerTagMeta(
      meta
    )
  }


  // バリデーションエラー
  if (updateNodes==undefined) {
    return failResponse
  }

  return new Response(
    JSON.stringify( updateNodes),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
    },
  });
};

export const deletePost = async (c: Context) => {
  const key = c.req.param("key");
  posts.remove(key);

  return new Response(
    JSON.stringify( undefined),
    {
      status: 204,
  });
};


/**
 * データがなければ作成しつつ更新する
 * @param req 
 * @returns 
 */
export const updatePost = async (c: Context) => {

  console.log(`updatePost Request( ${c.req.method}:${c.req.url} )`)

    const formBody = await c.req.parseBody()

  const failResponse = new Response(
    JSON.stringify( undefined),
    {
      status: 500,
      headers: {
        "content-type": "application/json",
    },
  });



  // メタファイルすらないリクエストは早期リターンする
  if (formBody==undefined || !formBody["meta"]) {
    return failResponse
  }
  if (formBody["meta"] == "{}") {
    return failResponse
  }

  let metaString = ""
  {
    const stringOrFile = getSingleOrArrayFirst<string| File>(formBody["meta"])
    if (is.String(stringOrFile))
    {
      metaString = stringOrFile
    }
  }

  if (metaString == "") {
    throw("空文字列です")
  }

  const meta = JSON.parse(metaString)
  let fileOrNull: File | null = null
  {
    const stringOrFile = getSingleOrArrayFirst<string|File>(formBody["file"])
    if (is.String(stringOrFile)){
      throw("fileに文字列が指定されています")
    } else {
      fileOrNull = stringOrFile
    }
  }
  //if ( is.Nullish(fileDirty)) {
  //  return failResponse
  //}

  //const file = fileDirty



  let updateNodes = null
  if (BlobMeta.validation(meta)) {
    //const result = await posts.load(meta.hash, true)

    // 一旦更新のみでも全部さしかえる
    /*
    if (is.Nullish (result)) {
    */
    if (is.Nullish(fileOrNull)){
      // meta更新の場合は、metaだけ更新する
      updateNodes = await posts.changeVectorTransaction(meta)
    } else {
      // blobもおくりつけられたときは、blobごと登録する
      const fileBuffer = await fileOrNull.arrayBuffer()
      const uint8array = new Uint8Array(fileBuffer)
      updateNodes = await registerBlobMeta(
        uint8array,
        meta
      );
    }


  } else if (TagMeta.validation(meta)) {
    const result = await posts.load(meta.hash, true)
    if (is.Nullish(result)) {
      // 新規登録
      updateNodes = await registerTagMeta(
        meta
      )
    } else {
      // 更新
      updateNodes = await posts.changeVectorTransaction(meta)
    }

  } else if (SymbolNode.validation(meta)) {
      updateNodes = await posts.changeVectorTransaction(meta)
  } else {
      // バリデーションエラー
      console.warn(`symbol node のバリデーションエラー \n${meta}`)
  }


  // バリデーションエラー
  if (updateNodes==undefined) {
    return failResponse
  }

  return new Response(
    JSON.stringify(updateNodes),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      }
    }
  )
};


