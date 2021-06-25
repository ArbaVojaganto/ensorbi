

/// <reference lib="dom" />

import { Node, NodeDictionary } from "./../models/Node.ts"
import { BlobMeta } from "./../models/BlobMeta.ts"
import { TagMeta } from "./../models/tags.ts"

import {
  GetRequest,
  CreateTextArea,
  CreateInputButton,
  removeAllChild,
  CreateAutocompleteInput,
} from "./../client/util.ts"

import { v4 } from "./../client/deps.ts"

import {
  isNull,
  splitFileName,
  bufferToHash,
  Range,
} from "./../common/util.ts";


export class SingleBlobUploader extends HTMLLIElement {
  private textArea: HTMLTextAreaElement | undefined
  // 元BLOB表示用
  private previewArea: HTMLImageElement | undefined
  // メタファイルに入れるサムネイルbase64データ作成用
  private previewCanvas: HTMLCanvasElement | undefined
  private file: File | null = null
  private meta: BlobMeta | null = null
  constructor(
    private updateNode: (e: Node, optionFormData: FormData) => Promise<Node[]>,
  ) {
    super()

    this.previewArea = document.createElement("img")
    this.previewArea.classList.add("uploaderPreview")
    this.appendChild(this.previewArea)

    this.previewCanvas = document.createElement('canvas')
    this.previewCanvas.classList.add("uploaderPreview")

    this.textArea = CreateTextArea(document, '{"title": "", "content": ""}', 22, 200)
    if (this.textArea) {this.appendChild(this.textArea)}

  }

  setFile = (meta: BlobMeta, file: File) => {
    this.meta = meta
    this.file = file

    //   Blob URLの作成
    const blobUrl = window.URL.createObjectURL(file);
    if (this.previewArea) {
      this.previewArea.src = blobUrl
    }

    // jsonを更新する
    if (this.textArea) {
      this.textArea.value = JSON.stringify(meta);
    }

    const createThumbnailAndPrepareJson = () => {
      const ctx = this.previewCanvas?.getContext('2d')
      if (!this.previewCanvas || !ctx) return
      const size = 100
      let rate = img.height / img.width
      let width = size
      let height = size * rate

      if (img.width < img.height) {
        // 対象画像が縦長
        rate = img.width / img.height
        width = size * rate
        height = size

      } else {
        // 対象画像が横長
        rate = img.height / img.width
        width = size
        height = size * rate
      }

      this.previewCanvas.width = width
      this.previewCanvas.height = height
      ctx.drawImage(img, 0, 0, width * rate, height)
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, width, height)

      const b64 = this.previewCanvas.toDataURL('image/png')

      // バッファを解決してからUI更新処理
      meta.thumbnail = b64

      // jsonを更新する
      if (this.textArea) {
        this.textArea.value = JSON.stringify(meta);
      }
    }

    // サムネイルが作れないファイルの場合は途中で処理が終わりそう。動作上問題ないけど間違いなくよくない
    const img = new Image()
    img.src = blobUrl
    img.onload = createThumbnailAndPrepareJson


  }

  registerBlobMeta = async (parent: HTMLUListElement) => {
    if (
      isNull(this.file) ||
      isNull(this.meta)
    ) {
      return []
    }
    const formData = new FormData();
    formData.set("meta", JSON.stringify(this.meta));
    // ファイル内容を詰める
    formData.set("file", this.file)
    const result = await this.updateNode(this.meta, formData)
    parent.removeChild(this)
    return result
  }

  tagInsert = (tag: TagMeta) => {
    if (
      isNull(this.file) ||
      isNull(this.meta) ||
      isNull(this.textArea)
    ) {
      return
    }
    const index = tag.hash
    this.meta.vector[index] = this.meta.vector[index] ?? {}
    this.meta.vector[index]["tag"] = 1
    this.textArea.value = JSON.stringify(this.meta)
  }

}

export class MultiFileUploader extends HTMLDivElement {
  private requestButton: HTMLButtonElement = document.createElement('button')
  private fileArea: HTMLInputElement = document.createElement('input')
  private DataList: HTMLUListElement = document.createElement('ul')
  private tagSelectorElement: HTMLInputElement = document.createElement('input')
  private tagInsertOrGenerateButtonElement: HTMLButtonElement = document.createElement('button')
  constructor(
    private updateNode: (e: Node, optionFormData: FormData) => Promise<Node[]>,
    private reload: () => void,
    private tagHashDict: () => NodeDictionary,
  ) {
    super()
    this.classList.add("multi-file-uploader")

    const tagDict: NodeDictionary = tagHashDict()
    const datalist = Object.values(tagDict).map((e: any) => e.title)
    this.tagSelectorElement = CreateAutocompleteInput(document, "li-tag-datalist", datalist)

    this.appendChild(this.tagSelectorElement)
    this.tagInsertOrGenerateButtonElement.textContent = 'tag insert or generate'
    this.tagInsertOrGenerateButtonElement.onclick = this.insertOrGenerateTag
    this.appendChild(this.tagInsertOrGenerateButtonElement)

    this.id = "file-uploader"
    this.fileArea = document.createElement("input")
    this.fileArea.setAttribute("type", "file")
    //this.fileArea.onchange = this.jsonUpdateWhenFileSelect
    this.appendChild(this.fileArea)

    this.requestButton = CreateInputButton(document, "send", this.sendCallback)
    this.appendChild(this.requestButton)

    this.appendChild(this.DataList)

    this.addEventListener('drop', this.dropCallback)
    this.addEventListener('dragover', function (evt) {
      evt.preventDefault();
      this.classList.add('dragover');
    });
    this.addEventListener('dragleave', function (evt) {
      evt.preventDefault();
      this.classList.remove('dragover');
    });

  }

  Reset = () => {
    removeAllChild(this.DataList)
  }

  createBlobMeta = async (file: File): Promise<BlobMeta | null> => {
    const splitedName = splitFileName(file.name);
    const extention = (isNull(splitedName.extention) || splitedName.extention == "") ? MIMEtoExtentionMap[file.type] : splitedName.extention
    if (isNull(extention)) {
      console.error(`シングルバイナリの拡張子が推測できなかった...`)
      return null
    }

    // 先にとりあえずメタファイルを作ってしまう
    const buffer = await file.arrayBuffer()
    // バッファを解決してからUI更新処理
    const hash = bufferToHash(buffer)
    const meta = new BlobMeta(
      hash,
      splitedName.name,
      extention,
      "",
      "", // CL側で適当にキャンバスに書きだしたものを縮小してサムネイル化する方が筋がよいかも。何も入っていなければSV側でサムネ用意してもいいし
      "",
      {},
      file.type,
      "",
    )
    return meta
  }

  setBlob = (blob: Blob) => {
    // 辞書内に存在すれば解釈可能なシングルバイナリがおちてきたということで...
    const file = new File([blob], v4.generate(), { type: blob.type })
    const dt = new DataTransfer()
    dt.items.add(file);
    this.SetFilesToElementList(dt.files)
  }

  SetFilesToElementList = async (files: FileList | File[]) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const meta = await this.createBlobMeta(file)
      if (isNull(meta)) { continue }
      const l = new SingleBlobUploader(this.updateNode)
      l.setFile(meta, file)
      this.DataList.appendChild(l)
    }
  }

  dropCallback = async (evt: DragEvent) => {
    if (
      isNull(evt.dataTransfer)
    ) { return }

    const dataTransfer = evt.dataTransfer
    evt.preventDefault();
    this.classList.remove('dragenter');

    const types = dataTransfer.types

    const entries = types.map(type => { return [type, dataTransfer.getData(type)] })

    for await (const [type, value] of entries) {
      switch (type) {

        case "text/html": {
          break
        }

        case "Files": {
          this.SetFilesToElementList(dataTransfer.files)
          break
        }

        case "text/plain": {
          break
        }

        case "text/uri-list": {
          const response = await GetRequest(value)
          if (isNull(response)) {
            console.warn(`responseが正しく取得できなかったので無視します`)
            break
          }
          const contentType = response.headers.get("content-type")
          if (isNull(contentType)) {
            console.warn(`responseヘッダにcontent-typeが入っていないので無視します`)
            break
          }
          const mimeType = ContentTypeToMimeType(contentType)
          if (isNull(mimeType)) {
            console.warn(`${contentType}からmimeTypeを取得できませんでした`)
            break
          }

          // とりあえずシングルバイナリとHTML以外が降ってきたらリジェクトする方針
          // HTMLが降ってきたらとりあえずそのHTML内に存在しているimgタグを全部画像候補として開く
          // レスポンスのMIMEタイプで分離
          switch (mimeType) {

            // シングルバイナリ                    
            case "image/png": // 判定雑すぎるけど許して...
            case "image/gif":
            case "image/jpeg": {
              const blob = await response.blob()
              if (isNull(blob)) {
                console.warn(`blobとして解釈できない`)
                break
              }
              console.log("ドロップオブジェクトはシングルバイナリと解釈できたよ")
              this.setBlob(blob)
              break
            }

            // HTML
            case "text/html": {
              const html = await response.text()
              if (isNull(html)) {
                console.warn(`textとして解釈できない`)
              }
              console.log("ドロップオブジェクトはHTMLと解釈できたよ")

              // htmlが降ってきたらおもむろにDOMツリーを構築する
              const parser = new DOMParser()
              const document = parser.parseFromString(html, mimeType)
              const imgs = document.querySelectorAll("img")
              const uris: string[] = []
              // とりあえず先にリンクリストを作る
              imgs.forEach((image: HTMLImageElement) => {
                uris.push(image.src)
              })
              console.log(uris)

              // 実際に取得してくる
              for await (const uri of uris) {
                const response = await GetRequest(value)
                const blob = await response?.blob()
                if (blob) {
                  console.log(blob)
                  if (MIMEtoExtentionMap[blob.type]) {
                    // 辞書内に存在すれば解釈可能なシングルバイナリがおちてきたということで...
                    //const file = new File([blob], v4.generate(), {type: blob.type})
                    //const dt = new DataTransfer()
                    //dt.items.add(file);
                    //let files = dt.files
                    //fileArea.files = files
                    //this.onChangeJsonUpdateWhenFileSelect(files)
                  }
                }

              }
              break
            }
            default: {
              console.warn(`${contentType}はレスポンスのmimeTypeとして許容できません`)
              break
            }
          }
          break
        }

        default: {
          console.log(`対応外のMIMEタイプがレスポンスとして渡されましたよ...${type}`)
          break
        }
      }


    }
  }

  sendCallback = () => {
    const enumrable = Range(0, this.DataList.children.length - 1).map((i: any) => this.DataList.children[i])
    const hash = ""
    enumrable.forEach((e: any) => {
      e.registerBlobMeta(this.DataList)
    })
    this.reload()
    //if (result.length && result[0]) {
    //  this.restartScopeManager(result[0].hash)
    //  //this.reload()
    //  return result
    //} else {
    //  return undefined
    //}
  }

  insertOrGenerateTag = async () => {
    //const node = JSON.parse(this.area jsonTextAreaElement.value)
    let tag = this.tagHashDict()[this.tagSelectorElement.value]
    if (isNull(tag)) {
      // タグがなければ生成する
      const generateTag = new TagMeta("", this.tagSelectorElement.value, "", "", "", {}, "")
      const formData = new FormData();
      formData.set("meta", JSON.stringify(generateTag));
      const resultNodes = await this.updateNode(generateTag, formData)

      console.log(`Tag:${this.tagSelectorElement.value} is not found. So Generate.`)
      // 空ならリクエスト失敗として処理を中断させる
      if (resultNodes.length == 0) { return }

      tag = this.tagHashDict()[this.tagSelectorElement.value]
    }

    if (isNull(tag)) {
      console.warn(`Tag:${this.tagSelectorElement.value} is not found. And Generate Failed...`)
      return
    }

    const enumrable = Range(0, this.DataList.children.length - 1).map((i: any) => this.DataList.children[i])
    enumrable.forEach((e: any) => {
      e.tagInsert(tag)
    })
    this.tagSelectorElement.value = ""
    this.reload()

  }
}


export class SingleFileUploader {
  public baseElement: HTMLDivElement | undefined
  private textArea: HTMLTextAreaElement | undefined
  private requestButton: HTMLButtonElement | undefined
  private fileArea: HTMLInputElement | undefined
  private previewArea: HTMLImageElement | undefined
  private previewCanvas: HTMLCanvasElement | undefined
  constructor(
    private document: HTMLDocument,
    private parentNode: HTMLElement,
    private updateNode: (e: Node, optionFormData: FormData) => Promise<Node[]>,
    private reload: () => void,
    private restartScopeManager: (hash: string) => void
  ) {
    // ルートノードを親に登録
    this.baseElement = document.createElement("div")
    const a = this.baseElement
    a.id = "file-uploader"
    parentNode.appendChild(a)

    this.fileArea = document.createElement("input")
    this.fileArea.setAttribute("type", "file")
    this.fileArea.onchange = this.jsonUpdateWhenFileSelect
    a.appendChild(this.fileArea)

    this.requestButton = CreateInputButton(document, "send", this.sendCallback)
    a.appendChild(this.requestButton)

    this.textArea = CreateTextArea(document, '{"title": "", "content": ""}', 30, 10)
    a.appendChild(this.textArea)

    this.previewArea = document.createElement("img")
    this.previewArea.classList.add("uploaderPreview")
    a.appendChild(this.previewArea)



    a.addEventListener('drop', this.dropCallback)

    a.addEventListener('dragover', function (evt) {
      evt.preventDefault();
      a.classList.add('dragover');
    });
    a.addEventListener('dragleave', function (evt) {
      evt.preventDefault();
      a.classList.remove('dragover');
    });

    this.previewCanvas = document.createElement('canvas')
    this.previewCanvas.classList.add("uploaderPreview")
    //a.appendChild(this.previewCanvas)
  }

  dropCallback = async (evt: DragEvent) => {
    if (
      !evt.dataTransfer ||
      isNull(this.textArea) ||
      isNull(this.fileArea) ||
      isNull(this.baseElement)
    ) { return }

    const dataTransfer = evt.dataTransfer
    const a = this.baseElement
    evt.preventDefault();
    a.classList.remove('dragenter');

    const types = dataTransfer.types

    const fileArea = this.fileArea
    if (isNull(fileArea)) {
      console.error(`jsonを更新しようとしたがfileArea要素が存在しないよ`)
      return
    }

    const entries = types.map(type => { return [type, dataTransfer.getData(type)] })

    for await (const [type, value] of entries) {
      switch (type) {

        case "text/html": {
          break
        }

        case "Files": {
          this.setFiles(dataTransfer.files)
          break
        }

        case "text/plain": {
          break
        }

        case "text/uri-list": {
          const response = await GetRequest(value)
          if (isNull(response)) {
            console.warn(`responseが正しく取得できなかったので無視します`)
            break
          }
          const contentType = response.headers.get("content-type")
          if (isNull(contentType)) {
            console.warn(`responseヘッダにcontent-typeが入っていないので無視します`)
            break
          }
          const mimeType = ContentTypeToMimeType(contentType)
          if (isNull(mimeType)) {
            console.warn(`${contentType}からmimeTypeを取得できませんでした`)
            break
          }

          // とりあえずシングルバイナリとHTML以外が降ってきたらリジェクトする方針
          // HTMLが降ってきたらとりあえずそのHTML内に存在しているimgタグを全部画像候補として開く
          // レスポンスのMIMEタイプで分離
          switch (mimeType) {

            // シングルバイナリ                    
            case "image/png": // 判定雑すぎるけど許して...
            case "image/gif":
            case "image/jpeg": {
              const blob = await response.blob()
              if (isNull(blob)) {
                console.warn(`blobとして解釈できない`)
                break
              }
              console.log("ドロップオブジェクトはシングルバイナリと解釈できたよ")
              this.setBlob(blob)
              break
            }

            // HTML
            case "text/html": {
              const html = await response.text()
              if (isNull(html)) {
                console.warn(`textとして解釈できない`)
              }
              console.log("ドロップオブジェクトはHTMLと解釈できたよ")

              // htmlが降ってきたらおもむろにDOMツリーを構築する
              const parser = new DOMParser()
              const document = parser.parseFromString(html, mimeType)
              const imgs = document.querySelectorAll("img")
              const uris: string[] = []
              // とりあえず先にリンクリストを作る
              imgs.forEach((image: HTMLImageElement) => {
                uris.push(image.src)
              })
              console.log(uris)

              // 実際に取得してくる
              for await (const uri of uris) {
                const response = await GetRequest(value)
                const blob = await response?.blob()
                if (blob) {
                  console.log(blob)
                  if (MIMEtoExtentionMap[blob.type]) {
                    // 辞書内に存在すれば解釈可能なシングルバイナリがおちてきたということで...
                    //const file = new File([blob], v4.generate(), {type: blob.type})
                    //const dt = new DataTransfer()
                    //dt.items.add(file);
                    //let files = dt.files
                    //fileArea.files = files
                    //this.onChangeJsonUpdateWhenFileSelect(files)
                  }
                }

              }
              break
            }
            default: {
              console.warn(`${contentType}はレスポンスのmimeTypeとして許容できません`)
              break
            }
          }
          break
        }

        default: {
          console.log(`対応外のMIMEタイプがレスポンスとして渡されましたよ...${type}`)
          break
        }
      }


    }
  }

  setBlob = (blob: Blob) => {
    // 辞書内に存在すれば解釈可能なシングルバイナリがおちてきたということで...
    const file = new File([blob], v4.generate(), { type: blob.type })
    const dt = new DataTransfer()
    dt.items.add(file);
    this.setFiles(dt.files)
  }

  setFiles = (files: FileList) => {
    if (!this.fileArea) return
    this.fileArea.files = files;
    this.onChangeJsonUpdateWhenFileSelect(files)
  }

  sendCallback = async () => {
    if (!this.textArea) return
    if (!this.fileArea) return
    if (!this.fileArea.files) return

    const node = JSON.parse(this.textArea.value)
    if (!BlobMeta.validation(node)) {
      console.warn(`blobmetaと解釈できませんでした ${node}`)
      return
    }

    const formData = new FormData();

    formData.set("meta", JSON.stringify(this.textArea.value));
    formData.set("file", this.fileArea.files[0]); // ファイル内容を詰める

    const result = await this.updateNode(node, formData)
    // ブラウザ上でバイナリからハッシュだすのと、
    // サーバー側でバイナリからハッシュ出すのでずれてしまうので、とりあえずサーバー側を正にしている
    if (result.length && result[0]) {
      this.restartScopeManager(result[0].hash)
      //this.reload()
      return result
    } else {
      return undefined
    }
  }

  /**
   * ファイル更新イベント
   * @param value 
   */
  jsonUpdateWhenFileSelect = (value: any) => {
    const files = value.currentTarget.files
    this.onChangeJsonUpdateWhenFileSelect(files)
  }

  onChangeJsonUpdateWhenFileSelect = async (files: FileList) => {
    if (files.length <= 0) return


    const file = files[0]
    const splitedName = splitFileName(file.name);
    const extention = (isNull(splitedName.extention) || splitedName.extention == "") ? MIMEtoExtentionMap[file.type] : splitedName.extention
    if (isNull(extention)) {
      console.error(`シングルバイナリの拡張子が推測できなかった...`)
      return
    }

    // 先にとりあえずメタファイルを作ってしまう
    const buffer = await file.arrayBuffer()
    // バッファを解決してからUI更新処理
    const hash = bufferToHash(buffer)
    const meta = new BlobMeta(
      hash,
      splitedName.name,
      extention,
      "",
      "", // CL側で適当にキャンバスに書きだしたものを縮小してサムネイル化する方が筋がよいかも。何も入っていなければSV側でサムネ用意してもいいし
      "",
      {},
      file.type,
      "",
    )

    if (this.textArea) {
      this.textArea.value = JSON.stringify(meta);
    }


    //   Blob URLの作成
    const blobUrl = window.URL.createObjectURL(file);
    if (this.previewArea) {
      this.previewArea.src = blobUrl
    }


    const createThumbnailAndPrepareJson = () => {
      const ctx = this.previewCanvas?.getContext('2d')
      if (!this.previewCanvas || !ctx) return
      const size = 100
      let rate = img.height / img.width
      let width = size
      let height = size * rate

      if (img.width < img.height) {
        // 対象画像が縦長
        rate = img.width / img.height
        width = size * rate
        height = size

      } else {
        // 対象画像が横長
        rate = img.height / img.width
        width = size
        height = size * rate
      }

      this.previewCanvas.width = width
      this.previewCanvas.height = height
      ctx.drawImage(img, 0, 0, width * rate, height)
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, width, height)

      const b64 = this.previewCanvas.toDataURL('image/png')

      // バッファを解決してからUI更新処理
      meta.thumbnail = b64

      // jsonを更新する
      if (this.textArea) {
        this.textArea.value = JSON.stringify(meta);
      }
    }

    // サムネイルが作れないファイルの場合は途中で処理が終わりそう。動作上問題ないけど間違いなくよくない
    const img = new Image()
    img.src = blobUrl
    img.onload = createThumbnailAndPrepareJson
  }

}

/**
 * text/html; charset=utf-8とかのContentTypeをそのままつっこんでもいいかんじにMIMETypeをかえしてくれるように
 * @param contentType 
 */
const ContentTypeToMimeType = (contentType: string): string | undefined => {
  return Object.entries(MIMEtoExtentionMap).filter(([key, value]) => {
    return contentType.includes(key)
  })[0][0]
}

/**
 * MIMETYPEから拡張子を取得する
 * 辞書内に存在しなければundefinedを返す
 */
const MIMEtoExtentionMap: { [key: string]: string } = {
  "text/html": ".html",
  "image/png": ".png",
  "image/jpeg": ".jpeg",
  "image/gif": ".gif",
}


