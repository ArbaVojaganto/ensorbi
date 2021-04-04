import { parserMultipartRequest } from "./../server/deps.ts"
import type { ServerRequest, } from "./../server/deps.ts"


import { BlobMeta } from "./../models/BlobMeta.ts"
import { TagMeta } from "./../models/tags.ts"
import { SymbolNode } from "./../models/SymbolNode.ts"
import { posts, StoredPosts, registerBlobMeta, registerTagMeta } from "./../server/StoredPosts.ts";
import { multiParser  } from './../server/deps.ts'
import { FormFile } from './../server/deps.ts'
import { isNull } from './../common/util.ts'


export const getAllPosts = async (req: ServerRequest) => {
  await posts.fetchAll()
  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": "application/json",
    }),
    body: JSON.stringify(posts.toArray()),
  });
};

export const getPost = async (req: ServerRequest) => {
  const [_, key] = req.match;
  const ret: {[hash: string]: any} = {}
  ret[key] = await posts.fetch(key)
  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": "application/json",
    }),
    body: JSON.stringify( ret ),
  });
};

export const createPost = async (req: ServerRequest) => {
  const form = (await multiParser(req))

  const failResponse = async() => {
    await req.respond({
      status: 500,
      headers: new Headers({
        "content-type": "application/json",
      }),
      body: JSON.stringify(undefined)
    })
  }

  // メタファイルすらないリクエストは早期リターンする
  if (form==undefined || !form.fields["meta"]) {
    return failResponse()
  }
  if (form.fields["meta"] == "{}") {
    return failResponse()
  }

  const meta = JSON.parse(JSON.parse((form.fields["meta"])))
  const file: FormFile = (form.files["file"] instanceof Array)? form.files["file"][0]: form.files["file"];

  let updateNodes = undefined
  if (BlobMeta.validation(meta)) {
    // 新規登録
    updateNodes = await registerBlobMeta(
      file.content,
      meta
    );

  } else if (TagMeta.validation(meta)) {
    updateNodes = await registerTagMeta(
      meta
    )
  }


  // バリデーションエラー
  if (updateNodes==undefined) {
    return failResponse()
  }

  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": "application/json",
    }),
    body: JSON.stringify(updateNodes),
  });
};

export const deletePost = async (req: ServerRequest) => {
  const [_, key] = req.match;
  posts.remove(key);

  await req.respond({
    status: 204,
  });
};


/**
 * データがなければ作成しつつ更新する
 * @param req 
 * @returns 
 */
export const updatePost = async (req: ServerRequest) => {
  const form = (await multiParser(req))

  const failResponse = async() => {
    await req.respond({
      status: 500,
      headers: new Headers({
        "content-type": "application/json",
      }),
      body: JSON.stringify(undefined)
    })
  }

  // メタファイルすらないリクエストは早期リターンする
  if (form==undefined || !form.fields["meta"]) {
    return failResponse()
  }
  if (form.fields["meta"] == "{}") {
    return failResponse()
  }

  const meta = JSON.parse((form.fields["meta"]))
  const file: FormFile = (form.files["file"] instanceof Array)? form.files["file"][0]: form.files["file"];

  let updateNodes = undefined
  if (BlobMeta.validation(meta)) {
    const result = await posts.load(meta.hash, true)
    if (isNull(result)) {
      // 新規登録
      updateNodes = await registerBlobMeta(
        file.content,
        meta
      );
    } else {
      // 更新
      updateNodes = await posts.changeVectorTransaction(meta)
    }

  } else if (TagMeta.validation(meta)) {
    const result = await posts.load(meta.hash, true)
    if (isNull(result)) {
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
    return failResponse()
  }

  await req.respond({
    status: 200,
    headers: new Headers({
      "content-type": "application/json",
    }),
    body: JSON.stringify(updateNodes),
  });
};