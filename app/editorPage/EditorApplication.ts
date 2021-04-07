
/// <reference lib="dom" />

import type { NodeEdge as Edge, EdgeDict, NodeDictionary, NodeType } from "./../models/Node.ts"
import { Node } from "./../models/Node.ts"
import { BlobMeta} from "./../models/BlobMeta.ts"
import { TagMeta } from "./../models/tags.ts"
import { SymbolNode } from "./../models/SymbolNode.ts"
import {
  CreateInputButton,
  CreateAutocompleteInput,
} from "./../client/util.ts"
import {
  isNull,
  bufferToHash,
  todayString,
} from "./../common/util.ts";

import { ScopeGraphManager } from "./../client/ScopeGraphManager.ts"
import { EditableNodeDetail } from "./../client/NodeDetail.ts"
import { StoredNodes } from "./../client/StoredNodes.ts"
import { CanvasManager } from "./../client/CanvasManager.ts"
import { SingleFileUploader } from "./../editorPage/SingleFileUploader.ts"



/**
 * 指定HTMLElement配列を子にもつアコーディオンメニューを作成する
 */
const createAccordionMenu = (menuLabel: string, childs: HTMLElement[]) => {
  const ulroot = document.createElement('ul')
  const li = document.createElement('li')
  ulroot.appendChild(li)
  const label = document.createElement('label')
  label.innerText = menuLabel
  li.appendChild(label)
  const accordion = document.createElement('input')
  accordion.type = 'checkbox'
  accordion.classList.add('toggle')
  li.appendChild(accordion)

  const ul = document.createElement('ul')
  ul.classList.add('accordion-child')
  li.appendChild(ul)

  childs.forEach( e => {
    const childli =  document.createElement('li')
    childli.appendChild(e) 
    ul.appendChild(childli)
  })
  return ulroot
}




export class GlobalMenu {
  private fileUploader: SingleFileUploader | undefined
  private tagDict: NodeDictionary = {}
  constructor(
    private document: HTMLDocument,
    private rootNode: HTMLElement,
    private tagNameInput: HTMLInputElement,
    private requestButton: HTMLButtonElement,
    private reload: () => void,
    private updateNode: (node: Node, optionFormData: FormData) => Promise<Node[]>,
    private tagHashDict: () => NodeDictionary,
    private scopeManager: ScopeGraphManager,
  ) {
    rootNode.appendChild(tagNameInput);
    rootNode.appendChild(requestButton);
    requestButton.onclick = this.addTagRequest

    // タイトル指定してシンボルノードを作成する
    const createSymbolNodeRequsetUI = () => {
      const childs = []
      const title = document.createElement('input')
      title.placeholder = "title: required"
      childs.push(title)
      const remoteUri = document.createElement('input')
      remoteUri.placeholder = "remoteUri: optional"
      childs.push(remoteUri)
      const description = document.createElement('input')
      description.placeholder = "description: optional"
      childs.push(description)
      const requestButton = document.createElement('button')
      requestButton.innerText = "create"
      childs.push(requestButton)
      
      requestButton.onclick = async () => {
        if (title.value == "") return

        const symbol = new SymbolNode("",title.value, "", "", description.value, {}, remoteUri.value)
        const formData = new FormData();
        const resultNodes = await this.updateNode(symbol, formData)

        // 空ならリクエスト失敗としてなにもしない
        if (resultNodes.length == 0) { return }
        this.reload()

      }
      const menu = createAccordionMenu("createSymbolNode: ", childs)
      return menu
    }
    rootNode.appendChild(createSymbolNodeRequsetUI())


    this.fileUploader = new SingleFileUploader(document,rootNode, updateNode, reload)
    if (this.fileUploader.baseElement) {
      const menu = createAccordionMenu("singleFileUploader: ", [this.fileUploader.baseElement])
      rootNode.appendChild(menu)
    }




    const toAllScope = document.createElement("button")
    toAllScope.onclick = () => {
      this.scopeManager?.restart(bufferToHash("node"))
    }
    toAllScope.innerText = `toAllScope`
    rootNode.appendChild(toAllScope)

    const toTagScope = document.createElement('button')
    toTagScope.onclick = () => {
      this.scopeManager?.restart(bufferToHash("tag"))
    }
    toTagScope.innerText = `toTagScope`
    rootNode.appendChild(toTagScope)

    const toBlobScope = document.createElement('button')
    toBlobScope.onclick = () => { 
      this.scopeManager?.restart(bufferToHash("blob"))
    }
    toBlobScope.innerText = `toBlobScope`
    rootNode.appendChild(toBlobScope)

    const toTodayScope = document.createElement('button')
    toTodayScope.onclick = () => { 
      const s = todayString()
      if (s) {
        this.scopeManager?.restart(bufferToHash(s))
      }
    }
    toTodayScope.innerText = `toTodayScope`
    rootNode.appendChild(toTodayScope)



    //const test = {
    //  first : "1",
    //  second : 2,
    //  third : {
    //    hoge: "3",
    //    fuga : 4,
    //    wai : { first : "5" },
    //  }
    //}
    ////rootNode.appendChild(nodeToRecursiveUList(document, test))
    //const a = objToRecurisveAccordionMenu (document, test)
    //rootNode.appendChild(a)
  }

  /**
   * 
   * @param datalist オートコンプリート用文字列を再読み込みする
   */
  updateTagDatalist = (datalist: string[]) => {
    const dl = this.tagNameInput.firstChild
    if (isNull(dl)) return

    while (dl.firstChild) {
      dl.removeChild(dl.firstChild);
    }
    datalist.forEach( e=> {
      const option = this.document.createElement('option')
      option.value = e
      dl.appendChild(option)
    })
  }


  addTagRequest = async (e: any) => {
    if (this.tagNameInput.value == "") return

    const tag = new TagMeta("",this.tagNameInput.value, "","", "", {}, "")
    const formData = new FormData();
    formData.set("meta", JSON.stringify(tag));
    const resultNodes = await this.updateNode(tag, formData)

    // 空ならリクエスト失敗としてなにもしない
    if (resultNodes.length == 0) { return }
    this.reload()
    this.tagDict = this.tagHashDict()
    const datalist = Object.values(this.tagDict).map(e => e.title)
    this.updateTagDatalist(datalist)
  }

  public static init = (
    document: HTMLDocument,
    rootElement: Element,
    reload: () => void,
    tagHashDict: () => NodeDictionary,
    updateNode: (node: Node, optionFormData: FormData) => Promise<Node[]>,
    scopeManager: ScopeGraphManager,
  ): GlobalMenu | undefined => {

    const globalMenu = document.createElement("div")
    if (isNull(globalMenu)) return undefined
    globalMenu.id = "network-graph-global-menu"

    rootElement.appendChild(globalMenu)

    const tagDict = tagHashDict()
    const datalist = Object.values(tagDict).map(e => e.title)
    const tagNameInput = CreateAutocompleteInput(document, "tag-names", datalist)
    if (isNull(tagNameInput)) return undefined;

    const requestButton = CreateInputButton(document, "generate TagNode");
    if (isNull(requestButton)) return undefined;


    const i = new GlobalMenu(
      document,
      globalMenu,
      tagNameInput,
      requestButton,
      reload,
      updateNode,
      tagHashDict,
      scopeManager,
    )
    return i
  }
}


const parseHtmlElement = (element: HTMLElement): any => {
  const a: any = {}

  for( let i = 0; i < element.children.length; i++  ){
    const e:any = element.children[i]
    // なんかいいかんじにul要素かinput要素かを判定して再帰かける必要がある
    if (e.innerText && e.innerText != "") {
      a[e.innerText] = e.firstChild.value
    }
  }
}


/**
 * /LocalMenu
 *  /EditableNodeDetail
 */
export class LocalMenu extends HTMLDivElement {
  detail: EditableNodeDetail | undefined
    //this.localMenu = new LocalMenu(this.store.tagHashDict, this.store.fetch, this.store.update, this.reload)
  constructor(
    tagHashDict: () => NodeDictionary,
    private fetchNode: (uri: string) => Promise<Node | undefined>,
    private updateNode: (node: Node, optionFormData: FormData) => Promise<Node[]>,
    private reload: () => void
  ) {
    super()
    this.id = "network-graph-local-menu"

    const tagDict: NodeDictionary = tagHashDict()
    const datalist = Object.values(tagDict).map(e => e.title)
    const tagSelector = CreateAutocompleteInput(document, "li-tag-datalist", datalist)

    // タグ追加ボタン
    const tagAdder = CreateInputButton(document, "tagInsert", () => {})

    this.detail = new EditableNodeDetail(
      document.createElement('p'),
      document.createElement('p'),
      document.createElement('a'),
      document.createElement('textarea'),
      document.createElement('img'),
      tagSelector,
      tagAdder,
      document.createElement('ul'),
      tagHashDict,
      fetchNode,
      updateNode,
      reload,
    )

    this.appendChild(this.detail)
  }

  public setDetail(node: Node) {
    if (isNull(this.detail)) return
    this.detail.setDetail(node)
  }

  public reloadDetail() {
    if (!isNull(this.detail)) {
      this.detail.reloadDetail()
    }
  }

}




export class EditorApplication {
  store: StoredNodes = new  StoredNodes()
  scopeGraphHistory = new ScopeGraphManager()
  globalMenu: GlobalMenu | undefined
  canvasManager: CanvasManager | undefined
  localMenu: LocalMenu | undefined

  updateFunctions: (() => void)[] = []

  constructor(
    public document: HTMLDocument,
    public containerNode: Element,
  ) {
    this.scopeGraphHistory = new ScopeGraphManager()
    this.canvasManager = new CanvasManager( this.document, this.containerNode)
  }

  init = ()=> {
    if (isNull(this.canvasManager) || isNull(this.canvasManager.graphCanvas)) return 
    this.canvasManager.init()
    //const node = bufferToHash("node")
    //const tag = bufferToHash("tag")
    //const blob = bufferToHash("blob")
    const entryPoint = bufferToHash("entryPoint")

    // initialノード
    const n = entryPoint

      // グラフマネージャーを初期化する
    this.scopeGraphHistory.dependancyModuleInjection(this.canvasManager, this.store, this.activateNode)
    this.scopeGraphHistory.restart(n)

    // メインアップデートを開始
    this.update()

    // 左メニュー追加
    this.globalMenu = GlobalMenu.init(
      this.document,
      this.containerNode,
      this.reload,
      this.store.tagHashDict,
      this.store.update,
      this.scopeGraphHistory
    )

    customElements.define('localmenu-div', LocalMenu, {extends: 'div'})
    customElements.define('node-detail-div', EditableNodeDetail, {extends: 'div'})

  }

  /**
   * カレントスコープを再読み込みする
   */
  reload = async () => {
    await this.scopeGraphHistory.currentScopeReload()
    if (!isNull(this.localMenu)) {
      this.localMenu.reloadDetail()
    }
  }

  activateNode = (node: Node) => {
    if (isNull(this.localMenu)) {
      // なかったら生成してDOMを追加
      this.localMenu = new LocalMenu(this.store.tagHashDict, this.store.fetch, this.store.update, this.reload)
      this.containerNode.appendChild(this.localMenu)
    }

    this.localMenu.setDetail(node)
  }

  //eventReceiver (message: any) {
  //  message
  //}

  setUpdateFunction = (fn: () => void ) => {
    this.updateFunctions.push(fn)
  }

  update = () => {
    // canvasの変形処理
    this.canvasManager?.update()
    // ネットワーク更新
    this.scopeGraphHistory.update()

    // ネットワーク描画
    this.scopeGraphHistory.draw()

    // 更新メソッドの集合を呼び出していく
    this.updateFunctions.forEach ( e => {
      e()
    })

    requestAnimationFrame(this.update);
  }
}



