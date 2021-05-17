
/// <reference lib="dom" />


/**
 * ここでは中身をキャストせずレスポンスをそのまま戻り値とする
 * @param uri 
 * @param query 
 */
export const GetRequest = async (uri: string, query = ""): Promise<undefined|Response> => {
  console.log(`HTTP REQUEST GET:${uri}${query}`)
  //APIからJSONデータを取得する
  return await fetch(uri + query)
    .then((response) => {
      return response
    })
    .catch((e) => {
      console.log(e); //エラーをキャッチし表示
      return undefined
    });
};

export const PostRequest = async (uri: string, body: string, files: FileList) => {
  // とりあえず先頭だけ...
  const file = files[0];

  // 送信データの準備
  const formData = new FormData();
  formData.set("meta", JSON.stringify(body));
  formData.set("file", files[0]); // ファイル内容を詰める

  const param = {
    method: "POST",
    body: formData,
  };

  //APIからJSONデータを取得する
  return await fetch(uri, param)
    .then((response) => {
      return response.json(); //ここでBodyからJSONを返す
    })
    .catch((e) => {
      console.log(e); //エラーをキャッチし表示
    });
};

export const DeleteRequest = async (uri: string) => {
  //APIからJSONデータを取得する
  return await fetch(uri, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  })
    .then((response) => {
      return response.json(); //ここでBodyからJSONを返す
    })
    .catch((e) => {
      console.log(e); //エラーをキャッチし表示
    });
};

export const PutRequest = async (uri: string, formData: FormData) => {

  //// 送信データの準備
  console.log({...formData.getAll})
  const param = {
    method: "PUT",
    body: formData,
  };

  //APIからJSONデータを取得する
  return await fetch(uri, param)
    .then((response) => {
      return response
    })
    .catch((e) => {
      console.log(e); //エラーをキャッチし表示
      return undefined
    });
};

export const PatchRequest = async (uri: string) => {
  //APIからJSONデータを取得する
  return await fetch(uri, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  })
    .then((response) => {
      return response.json(); //ここでBodyからJSONを返す
    })
    .catch((e) => {
      console.log(e); //エラーをキャッチし表示
    });
};

export const CreateTextArea = (
  document: HTMLDocument,
  value: string = '{"title": "", "content": ""}',
  rows: number = 10,
  cols: number = 10,
): HTMLTextAreaElement => {
  let area = document.createElement("textarea");
  area.readOnly = false;
  area.value = value;
  area.rows = rows;
  area.cols = cols;
  return area;
};

export const CreateInputText = (
  document: HTMLDocument,
  value: string = "",
): HTMLInputElement => {
  let input = document.createElement("input");
  input.type = "text";
  input.value = "tag";
  return input;
};

export const CreateInputButton = (
  document: HTMLDocument,
  value: string = "",
  callback = (e: any) => {},
): HTMLButtonElement => {
  let button = document.createElement("button");
  //button.type = "button";
  button.innerText = value
  button.value = value;
  button.onclick = callback;
  return button;
};

export const CreateImg = (
  document: HTMLDocument,
  src: string,
  width: number = 0,
  height: number = 0,
  alt: string = "",
): HTMLImageElement => {
  let img = document.createElement("img");
  img.src = src;
  if (width != 0) img.width = width;
  if (height != 0) img.height = height;
  img.alt = alt;
  return img;
};

export const CreateAutocompleteInput = (document: HTMLDocument, dataListId: string, dataList: string[] = [], value: string = "") => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.setAttribute('list', dataListId);
    input.autocomplete = "true"
    let dl = document.createElement('datalist')
    dl.id = dataListId
    dataList.forEach( e=> {
      let option = document.createElement('option')
      option.value = e
      dl.appendChild(option)
    })
    input.appendChild(dl)
    return input
}


/**
 * 子要素を全て削除する
 * @param target 
 */
export const removeAllChild = (target: Element) => {
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }
}