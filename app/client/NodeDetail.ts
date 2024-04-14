

/// <reference lib="dom" />

import type { NodeEdge as Edge, EdgeDict, NodeDictionary, NodeType } from "./../models/Node.ts"
import { Node } from "./../models/Node.ts"
import { TagMeta } from "./../models/tags.ts"
import { BlobMeta} from "./../models/BlobMeta.ts"
import { SymbolNode } from "./../models/SymbolNode.ts"
import {
  GetRequest,
  CreateAutocompleteInput,
  removeAllChild,
} from "./../client/util.ts"
import {
  isNull,
  orgmodeResourcePath,
  blobResourcePath,
  metaResourcePath,
  projectResourcePath,
} from "./../common/util.ts";

import { orgParser } from "./../client/deps.ts"

// index.htmlのインラインスクリプトで定義されているであろうリモートパスのグローバル宣言
declare var remoteStorageURL: string;


export class NodeDetail extends HTMLDivElement {
  private modalOpenElement: HTMLDivElement | undefined
  private modalWindowElement: HTMLElement | undefined
  protected currentNode: Node | undefined
  private titleElement: HTMLParagraphElement | undefined
  private descriptionElement: HTMLParagraphElement | undefined
  private thumbnailElement: HTMLImageElement | undefined
  private properties: HTMLUListElement | undefined
  private tags: HTMLUListElement | undefined
  constructor (
    protected fetchNode: (uri: string) => Promise<Node | undefined>,
  ) {
    super()
    this.classList.add("node-detail")

    this.thumbnailElement = document.createElement('img')
    this.thumbnailElement.classList.add("thumbnail")
    this.thumbnailElement.hidden = true
    this.appendChild(this.thumbnailElement)

    this.titleElement = document.createElement('p')
    this.titleElement.innerText = "title"
    this.appendChild(this.titleElement)

    this.descriptionElement = document.createElement('p')
    this.descriptionElement.innerText = "description"
    this.appendChild(this.descriptionElement)

    // モーダルウィンドウテスト
    const modal = document.getElementById('modal')
    const mask = document.getElementById('mask')
    this.modalOpenElement = document.createElement("div")

    if (modal != null && mask != null && !isNull(this.modalOpenElement) ) {
      this.modalOpenElement.id = "open"
      this.modalOpenElement.innerText = "click to open content"
      this.modalOpenElement.onclick = () => {
          modal.classList.remove('hidden')
          mask.classList.remove('hidden')
      }
      mask.onclick = () => {
          modal.classList.add('hidden')
          mask.classList.add('hidden')
      }
      this.appendChild(this.modalOpenElement)
      this.modalWindowElement = modal
    }
  }


  reloadDetail = async () => { 
    if ( this.currentNode ) {
      const remoteLatestNode = await this.fetchNode(this.currentNode.hash)
      if ( !isNull(remoteLatestNode)){
        this.setDetail( remoteLatestNode )
      }
    }
  }

  /**
   * 指定ノードでDOMを更新する
   * @param node 
   */
  public async setDetail(node: Node) {
    if (
      isNull(this.titleElement) ||
      isNull(this.thumbnailElement) ||
      isNull(this.descriptionElement)
    ) return
    this.titleElement.innerText = node.title.substring(0,25)
    this.descriptionElement.innerText = node.description

    const orgPathData = orgmodeResourcePath(node.hash)

    if (BlobMeta.validation(node) && (
      node.extention == ".jpeg" ||
      node.extention == ".png" ||
      node.extention == ".jpg" ||
      node.extention == ".gif"
      ) ) {
      const blobPathData = blobResourcePath(node.hash)
      this.thumbnailElement.src = remoteStorageURL + blobPathData.prefix + blobPathData.hashDir + blobPathData.hash + node.extention
      this.thumbnailElement.hidden = false
    } else {
      if (node.thumbnail == "") {
        this.thumbnailElement.hidden = true
      } else {
        this.thumbnailElement.src = node.thumbnail
        this.thumbnailElement.hidden = false
      }
    }


    // モーダルウィンドウを開いた時にiframeを生成する
    if (this.modalWindowElement) {
      // モーダルウィンドウ内を掃除
      while (this.modalWindowElement.firstChild) {
        this.modalWindowElement.removeChild(this.modalWindowElement.firstChild);
      }
      const orgText = await remoteOrgGet(node.hash)
      const html = org2Html(orgText)

      // htmlっぽいのものとして解釈できた時だけモーダルウィンドウに追加
      if ( html != "") {
        const blob = new Blob([html.contentHTML], { type: 'text/html' })
        const iframe = document.createElement("iframe")
        iframe.src = URL.createObjectURL(blob);
        this.modalWindowElement.appendChild(iframe)
      }
    }

    // プロパティUIを作成する
    const props = objToRecurisveAccordionMenu(document, node)
    //props.textContent = "props"
    if (isNull(this.properties)) {
      this.appendChild(document.createTextNode("props: "))
      this.properties = props
      this.appendChild(this.properties)
    } else {
      this.replaceChild(props, this.properties)
      this.properties = props
    }

    const tagsRoot = document.createElement('ul')
    // タグUIを作成する
    if (isNull(this.tags)) {
      this.tags = tagsRoot
      this.appendChild(this.tags)
    } else {
      this.replaceChild(tagsRoot, this.tags)
      this.tags = tagsRoot
    }

    // 登録し直し
    Object.entries(node.vector).forEach( async([target, label]) => {
      // 非同期に実行されても大丈夫なはずなのでとりあえずawaitなし
      const node = await this.fetchNode(target)
      if (node) {
        const li = document.createElement('li')
        li.innerText = node.title
        tagsRoot.appendChild(li)
      }
    })

    // インスタンスを持たせておく
    this.currentNode = node
  }
}



/**
 * プロパティ編集機能を持ったノード詳細エレメント
 */
export class EditableNodeDetail extends NodeDetail {
  private remoteOpenOrgElement: HTMLDivElement = document.createElement('div')
  private remoteOpenProjectElement: HTMLDivElement = document.createElement('div')
  private remoteOpenBlobElement: HTMLDivElement = document.createElement('div')
  private remoteOpenMetaElement: HTMLDivElement = document.createElement('div')
  private jsonTextAreaElement: HTMLTextAreaElement = document.createElement('textarea')
  private tagSelectorElement: HTMLInputElement = document.createElement('input')
  private tagInsertOrGenerateButtonElement: HTMLButtonElement = document.createElement('button')
  private tagListElement: HTMLUListElement = document.createElement('ul')
  constructor(
    fetchNode: (uri: string) => Promise<Node | undefined>,
    private tagHashDict: () => NodeDictionary,
    private updateNode: (node: Node, optionFormData: FormData) => Promise<Node[]>,
    private reload: () => void,
  ) {
    super (fetchNode)
    this.remoteOpenOrgElement.innerText = "xdgOpenOrg"
    this.appendChild(this.remoteOpenOrgElement)

    this.remoteOpenBlobElement.innerText = "xdgOpenBlob"
    this.appendChild(this.remoteOpenBlobElement)

    this.remoteOpenMetaElement.innerText = "xdgOpenMeta"
    this.appendChild(this.remoteOpenMetaElement)

    this.remoteOpenProjectElement.innerText = "xdgOpenProject"
    this.appendChild(this.remoteOpenProjectElement)

    this.appendChild(this.tagListElement)

    const tagDict: NodeDictionary = tagHashDict()
    const datalist = Object.values(tagDict).map(e => e.title)
    this.tagSelectorElement = CreateAutocompleteInput(document, "li-tag-datalist", datalist)

    this.appendChild(this.tagSelectorElement)
    this.tagInsertOrGenerateButtonElement.textContent = 'tag insert or generate'
    this.tagInsertOrGenerateButtonElement.onclick = this.insertOrGenerateTag
    this.appendChild(this.tagInsertOrGenerateButtonElement)

    this.jsonTextAreaElement.value = "text"
    this.appendChild(this.jsonTextAreaElement)
  }


  insertOrGenerateTag = async () => {
    const node = JSON.parse(this.jsonTextAreaElement.value)
    let tag = this.tagHashDict()[this.tagSelectorElement.value]
    if (isNull(tag)) {
      // タグがなければ生成する
      const generateTag = new TagMeta("",this.tagSelectorElement.value, "","", "", {}, "")
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
    

    if ( Node.validation(node)) {
      const index = tag.hash
      node.vector[index] = node.vector[index] ?? {}
      node.vector[index]["tag"] = 1
      this.jsonTextAreaElement.value = JSON.stringify(node)

      await this.updateNode(node, new FormData)
      this.reload()
    }
  }

  /**
   * 指定ノードでDOMを更新する
   * @param node 
   */
  public async setDetail(node: Node) {
    await super.setDetail(node)

    const orgPathData = orgmodeResourcePath(node.hash)
    this.jsonTextAreaElement.value = JSON.stringify(node)


    if (this.remoteOpenOrgElement) {
      // 子要素を掃除
      removeAllChild(this.remoteOpenOrgElement)
      const xdgOpenOrgPath = remoteStorageURL + "remote-xdg-like-open/" + orgPathData.prefix + orgPathData.hashDir + orgPathData.hash + orgPathData.extention
      const elems = PathElement( "org", "/" + orgPathData.prefix + orgPathData.hashDir + orgPathData.hash + orgPathData.extention, xdgOpenOrgPath)
      elems.forEach( e => { if (this.remoteOpenOrgElement) { this.remoteOpenOrgElement.appendChild(e)} })
    }


    if (this.remoteOpenBlobElement) {
      // BlobMetaの場合だけ 表示要素を増やす
      if (BlobMeta.validation(node) ) {
        removeAllChild(this.remoteOpenBlobElement)
        const blobPathData = blobResourcePath(node.hash)
        const xdgOpenBlobPath = remoteStorageURL + "remote-xdg-like-open/" + blobPathData.prefix + blobPathData.hashDir + blobPathData.hash + node.extention
        const elems = PathElement("blob", "/" + blobPathData.prefix + blobPathData.hashDir + blobPathData.hash + node.extention, xdgOpenBlobPath)
        elems.forEach( e => { if (this.remoteOpenBlobElement) { this.remoteOpenBlobElement.appendChild(e)} })
        this.remoteOpenBlobElement.hidden = false
      } else {
        this.remoteOpenBlobElement.hidden = true
      }
    }

    if (this.remoteOpenMetaElement) {
      removeAllChild(this.remoteOpenMetaElement)
      const metaPathData = metaResourcePath(node.hash)
      const xdgOpenMetaPath = remoteStorageURL + "remote-xdg-like-open/" + metaPathData.prefix + metaPathData.hashDir + metaPathData.hash + metaPathData.extention
      const elems = PathElement("json", "/" + metaPathData.prefix + metaPathData.hashDir + metaPathData.hash + metaPathData.extention, xdgOpenMetaPath)
      elems.forEach( e => { if (this.remoteOpenMetaElement) { this.remoteOpenMetaElement.appendChild(e)} })
    }

    if (this.remoteOpenProjectElement) {
      // SymbolNodeの場合だけ 表示要素を増やす
      if (SymbolNode.validation(node) ) {
        removeAllChild(this.remoteOpenProjectElement)
        const projectPathData = projectResourcePath(node.hash)
        const xdgOpenProjectPath = remoteStorageURL + "remote-xdg-like-open/" + projectPathData.prefix + projectPathData.hashDir + projectPathData.hash
        const elems = PathElement("project", "/" + projectPathData.prefix + projectPathData.hashDir + projectPathData.hash , xdgOpenProjectPath)
        elems.forEach( e => { if (this.remoteOpenProjectElement) { this.remoteOpenProjectElement.appendChild(e)} })
        this.remoteOpenProjectElement.hidden = false
      } else {
        this.remoteOpenProjectElement.hidden = true
      }
    }

    this.reloadTagSelectorDataList()

  }

  /**
   * タグ選択リストのデータリストを再読み込みする
   */
  reloadTagSelectorDataList = () => {
    // タグセレクタを再生成する
    const tagDict: NodeDictionary = this.tagHashDict()
    const datalist = Object.values(tagDict).map(e => e.title)

    const dl = document.getElementById("li-tag-datalist")
    if (!isNull(dl)) {
      while (dl.firstChild) {
        dl.removeChild(dl.firstChild);
      }
      datalist.forEach( e=> {
        let option = document.createElement('option')
        option.value = e
        dl.appendChild(option)
      })
    }
  }
}


/**
 * 任意のオブジェクトから再帰的なアコーディオンツリーDOMを作成する
 * @param document 
 * @param obj 
 * @returns 
 */
const objToRecurisveAccordionMenu = (document: HTMLDocument, obj: NonNullable<any>): HTMLUListElement => {
  const root = document.createElement('ul')
  root.classList.add('accordion-child')

  Object.entries(obj).forEach(([key, value]) => {
    const li = document.createElement('li')
    const label = document.createElement('label')
    label.innerText= `${key.substring(0,10)}: `
    li.appendChild(label)

    if (typeof value == 'object') {

      const accordion = document.createElement('input')
      accordion.type = 'checkbox'
      accordion.classList.add('toggle')
      li.appendChild(accordion)

      const ul = objToRecurisveAccordionMenu(document, value)
      li.appendChild(ul)
    } else if (typeof value == 'string' || typeof value == 'number') {
      const child = document.createElement('input')
      child.value = value.toString()
      li.appendChild(child)
    }
    root.appendChild(li)
  })
  return root
}




/**
 * 任意のテキストをクリップボードに書きこむ
 * あんまりよろしくないきもするがdocument.bodyに一時的に接続する
 * @param document 
 * @param text 
 * @returns 
 */
const textToClipBoard = (document: HTMLDocument, text : string): Boolean => {
  const tempElement = document.createElement("textarea");
  tempElement.textContent = text;
  document.body.appendChild(tempElement)
  document.getSelection()?.selectAllChildren(tempElement)

  tempElement.select();
  var success = document.execCommand('copy');
  document.body.removeChild(tempElement)
  return success;
}


/**
 * - div
 *  - name
 *  - copyButton
 *  - openButton
 */
const PathElement = (name: string, copyString: string, onClickRequestPath: string): HTMLElement[] => {        
  const elems:  HTMLElement[] = []
  const copy = document.createElement("button")
  copy.onclick = () => { textToClipBoard(document, copyString) }
  copy.innerText = `${name}: pathToClipboard`

  elems.push(copy)
  const request = document.createElement("button")
  request.onclick = () => { GetRequest(onClickRequestPath)}
  request.innerText = `${name}: remoteXdgOpen`
  elems.push(request)
  return elems
}



const remoteOrgGet = async(
  hash: string,
  force = false,
): Promise<string> =>  {
  const pathStruct = orgmodeResourcePath(hash)
  const path = remoteStorageURL + pathStruct.prefix + pathStruct.hashDir + pathStruct.hash + pathStruct.extention
  const response = await GetRequest(path);
  if (isNull(response)) return ""
  const text = await response.text()

  if (isNull(text)) {
    console.warn("Textとして解釈できないものを取得しました")
    return ""
  } else {
    //console.log(`remoteOrgGet: ${text}`)
    return text
  }
}

const org2Html = (orgText: string) => {
    const parser = new orgParser.default.Parser()
    const orgDocument = parser.parse(orgText)
    const html = orgDocument.convert(orgParser.default.ConverterHTML, {});
    return html
}