

/// <reference lib="dom" />

import type { NodeEdge as Edge, EdgeDict, NodeDictionary, NodeType } from "./../models/Node.ts"
import { Node } from "./../models/Node.ts"
import { BlobMeta} from "./../models/BlobMeta.ts"
import {
  GetRequest,
  CreateAutocompleteInput,
} from "./../client/util.ts"
import {
  isNull,
  orgmodeResourcePath,
  blobResourcePath,
  metaResourcePath,
} from "./../common/util.ts";


export class ReadOnlyNodeDetail extends HTMLDivElement {
  private modalOpenElement: HTMLDivElement | undefined
  private modalWindowElement: HTMLElement | undefined
  private currentNode: Node | undefined
  private titleElement: HTMLParagraphElement | undefined
  private descriptionElement: HTMLParagraphElement | undefined
  private thumbnailElement: HTMLImageElement | undefined
  private properties: HTMLUListElement | undefined
  private tags: HTMLUListElement | undefined
  constructor (
    private fetchNode: (uri: string) => Promise<Node | undefined>,
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
  public setDetail(node: Node) {
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
      this.thumbnailElement.src = blobPathData.prefix + blobPathData.hashDir + blobPathData.hash + node.extention
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
      const iframe = document.createElement("iframe")
      iframe.src = orgPathData.prefix + orgPathData.hashDir + orgPathData.hash + orgPathData.extention
      this.modalWindowElement.appendChild(iframe)
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
 * CustomElement
 */
export class EditableNodeDetail extends HTMLDivElement {
  private modalOpenElement: HTMLDivElement | undefined
  private modalWindowElement: HTMLElement | undefined
  private remoteOpenOrgElement: HTMLDivElement | undefined
  private remoteOpenBlobElement: HTMLDivElement | undefined
  private remoteOpenMetaElement: HTMLDivElement | undefined
  private currentNode: Node | undefined
  constructor(
    private titleElement: HTMLParagraphElement,
    private descriptionElement: HTMLParagraphElement,
    private remoteLinkElement: HTMLAnchorElement,
    private jsonTextAreaElement: HTMLTextAreaElement,
    private thumbnailElement: HTMLImageElement,
    private tagSelectorElement: HTMLInputElement,
    private tagInserterButtonElement: HTMLButtonElement,
    private tagListElement: HTMLUListElement,
    private tagHashDict: () => NodeDictionary,
    private fetchNode: (uri: string) => Promise<Node | undefined>,
    private updateNode: (node: Node, optionFormData: FormData) => Promise<Node[]>,
    private reload: () => void,
  ) {
    super()
    this.classList.add("node-detail")


    this.thumbnailElement.classList.add("thumbnail")
    this.thumbnailElement.hidden = true
    this.appendChild(this.thumbnailElement)

    this.titleElement.innerText = "title"
    this.appendChild(this.titleElement)

    this.descriptionElement.innerText = "description"
    this.appendChild(this.descriptionElement)

    this.remoteLinkElement.href = "remoteLink"
    this.appendChild(this.remoteLinkElement)



    // モーダルウィンドウテスト
    const modal = document.getElementById('modal')
    const mask = document.getElementById('mask')
    this.modalOpenElement = document.createElement("div")

    if (modal != null && mask != null && !isNull(this.modalOpenElement) ) {
      this.modalOpenElement.id = "open"
      this.modalOpenElement.innerText = "click"
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

    this.remoteOpenOrgElement = document.createElement("div")
    this.remoteOpenOrgElement.innerText = "xdgOpenOrg"
    this.appendChild(this.remoteOpenOrgElement)

    this.remoteOpenBlobElement = document.createElement("div")
    this.remoteOpenBlobElement.innerText = "xdgOpenBlob"
    this.appendChild(this.remoteOpenBlobElement)

    this.remoteOpenMetaElement = document.createElement("div")
    this.remoteOpenMetaElement.innerText = "xdgOpenMeta"
    this.appendChild(this.remoteOpenMetaElement)

    this.appendChild(this.tagListElement)


    // タグセレクタ
    this.appendChild(this.tagSelectorElement)
    this.tagInserterButtonElement.onclick = this.insertTag
    this.appendChild(this.tagInserterButtonElement)

    this.jsonTextAreaElement.value = "json"
    this.appendChild(this.jsonTextAreaElement)
  }

  insertTag = async () => {
    const node = JSON.parse(this.jsonTextAreaElement.value)
    const tag = this.tagHashDict()[this.tagSelectorElement.value]
    if ( Node.validation(node)) {
      const index = tag.hash
      node.vector[index] = node.vector[index] ?? {}
      node.vector[index]["tag"] = 1
      this.jsonTextAreaElement.value = JSON.stringify(node)

      await this.updateNode(node, new FormData)
      this.reload()
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
  public setDetail(node: Node) {
    this.titleElement.innerText = node.title.substring(0,10)
    this.descriptionElement.innerText = node.description

    const orgPathData = orgmodeResourcePath(node.hash)
    this.jsonTextAreaElement.value = JSON.stringify(node)

    if (BlobMeta.validation(node) && (
      node.extention == ".jpeg" ||
      node.extention == ".png" ||
      node.extention == ".jpg" ||
      node.extention == ".gif"
      ) ) {
      const blobPathData = blobResourcePath(node.hash)
      this.thumbnailElement.src = blobPathData.prefix + blobPathData.hashDir + blobPathData.hash + node.extention
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
      const iframe = document.createElement("iframe")
      iframe.src = orgPathData.prefix + orgPathData.hashDir + orgPathData.hash + orgPathData.extention
      this.modalWindowElement.appendChild(iframe)
    }


    /**
     * - div
     *  - name
     *  - copyButton
     *  - openButton
     */
    const PathElement = (name: string, copyString: string, onClickRequestPath: string): HTMLElement[] => {        
      const elems:  HTMLElement[] = []
      //const text = document.createElement("p")
      //text.innerText = name + ": "
      //elems.push(text)
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

    if (this.remoteOpenOrgElement) {
      // 子要素を掃除
      removeAllChild(this.remoteOpenOrgElement)
      const xdgOpenOrgPath = "remote-xdg-like-open/" + orgPathData.prefix + orgPathData.hashDir + orgPathData.hash + orgPathData.extention
      const elems = PathElement( "org", "/" + orgPathData.prefix + orgPathData.hashDir + orgPathData.hash + orgPathData.extention, xdgOpenOrgPath)
      elems.forEach( e => { if (this.remoteOpenOrgElement) { this.remoteOpenOrgElement.appendChild(e)} })
    }


    if (this.remoteOpenBlobElement) {
      if (BlobMeta.validation(node) ) {
        removeAllChild(this.remoteOpenBlobElement)
        const blobPathData = blobResourcePath(node.hash)
        const xdgOpenBlobPath = "remote-xdg-like-open/" + blobPathData.prefix + blobPathData.hashDir + blobPathData.hash + node.extention
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
      const xdgOpenMetaPath = "remote-xdg-like-open/" + metaPathData.prefix + metaPathData.hashDir + metaPathData.hash + metaPathData.extention
      const elems = PathElement("json", "/" + metaPathData.prefix + metaPathData.hashDir + metaPathData.hash + metaPathData.extention, xdgOpenMetaPath)
      elems.forEach( e => { if (this.remoteOpenMetaElement) { this.remoteOpenMetaElement.appendChild(e)} })
    }

    // タグリストを生成する
    while (this.tagListElement.firstChild) {
      this.tagListElement.removeChild(this.tagListElement.firstChild);
    }

    const ul = this.tagListElement

    // 登録し直し
    Object.entries(node.vector).forEach( async([target, label]) => {
      // 非同期に実行されても大丈夫なはずなのでとりあえずawaitなし
      const node = await this.fetchNode(target)
      if (node) {
        const li = document.createElement('li')
        li.innerText = node.title
        ul.appendChild(li)
      }
    })
    //ul.appendChild(nodeToRecursiveUList(document, node))
    ul.appendChild(objToRecurisveAccordionMenu(document, node))


    this.reloadTagSelectorDataList()

    // インスタンスを持たせておく
    this.currentNode = node
  }

  /**
   * タグ選択リストのデータリストを再読み込みする
   */
  reloadTagSelectorDataList = () => {
    // タグセレクタを再生成する
    const tagDict: NodeDictionary = this.tagHashDict()
    const datalist = Object.values(tagDict).map(e => e.title)
    const tagSelector = CreateAutocompleteInput(document, "li-tag-datalist", datalist)
    //// 再生成したノードで古いノードを置きかえる
    //this.replaceChild(tagSelector, this.tagSelectorElement)
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

const objToRecursiveUList  = (document: HTMLDocument, obj: any): HTMLUListElement => {
  const ul = document.createElement('ul')

  Object.entries(obj).forEach(([key, value]) => {
    const li = document.createElement('li')
    li.innerText = key.substring(0,10) + ": "

    if (typeof value == 'object') {
      const objElement = objToRecursiveUList(document, value)
      li.appendChild(objElement)

    } else if (typeof value == 'string' || typeof value == 'number') {
      const child = document.createElement('input')
      child.value = value.toString()
      li.appendChild(child)
    }
    ul.appendChild(li)
  })

  return ul
}

/**
 * nodeを再帰的なUList構造に変換する
 * @param document 
 * @param node 
 */
const nodeToRecursiveUList  = (document: HTMLDocument, node: Node): HTMLUListElement => {
  return objToRecursiveUList(document, node)
}

/**
 * 子要素を全て削除する
 * @param target 
 */
const removeAllChild = (target: Element) => {
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }
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