
/// <reference lib="dom" />

import type { NodeEdge as Edge, EdgeDict, NodeDictionary, NodeType } from "./../models/Node.ts"
import { Node } from "./../models/Node.ts"
import { BlobMeta} from "./../models/BlobMeta.ts"
import { TagMeta } from "./../models/tags.ts"
import { SymbolNode } from "./../models/SymbolNode.ts"
import {
  GetRequest,
  PutRequest,
  CreateTextArea,
  CreateInputButton,
  CreateInputText,
  CreateAutocompleteInput,
} from "./../client/util.ts"
import { Graph, GraphNode, v4 } from "./../client/deps.ts"
import {
  isNull,
  splitFileName,
  RangeRandom,
  bufferToHash,
  orgmodeResourcePath,
  blobResourcePath,
  metaResourcePath,
  todayString,
} from "./../common/util.ts";

import { CanvasManager } from "./CanvasManager.ts"



type ForceNode = {
  movable: boolean,
  nodeHash: string,
  title: string,
  thumbnail: string,
  vx: number,
  vy: number,
  x: number,
  y: number,
  links: EdgeDict,
  referers: EdgeDict,
}
type ForceGarphNodeDict = {
  [nodeHash: string]: ForceNode
}

/**
 * ノードをグラフで使用するノードインスタンスに変換する
 * @param node 
 */
const NodeToForceNode = (node: Node) => {
  const ret = {
    movable: true,
    nodeHash: node.hash,
    title: node.title,
    thumbnail: node.thumbnail,
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
    links: node.vector,
    referers: node.referers
  }
  return ret
}

/**
 * 指定ノード集合の座標を力学計算によって更新し、更新後のノード集合を返す
 * 引数の値はimmutableに扱う
 * 返り値をまたすぐこの関数にそのままぶちこめるように、差分ではなく差分適応後の座標をリンク情報つきでかえす
 */
const ForceGraphUpdate = (nodes: ForceGarphNodeDict, height: number, width: number): ForceGarphNodeDict => {
  const BOUNCE = 0.05
  const COULOMB = 600
  const ATTENUATION = 0.7


  // 全てのノードを列挙
  const ret = Object.entries(nodes)
    .map( ([key, target]):[string, ForceNode] => {
      let vx = 0
      let vy = 0

      if (target.movable) {

        let fx = 0
        let fy = 0

        // 全てのノードから受ける力を計算
        Object.entries(nodes).forEach( ([edgeTargetUri, n]) => {
          if (key != edgeTargetUri) {
            const distX = target.x - n.x
            const distY = target.y - n.y
            const rsq = distX * distX + distY * distY

            fx += COULOMB * distX/rsq
            fy += COULOMB * distY/rsq
          }
        })


        // つながってるノードから受ける力を計算
        // 参照と被参照を中心ノードからのエッジを一旦連想配列にまとめる
        const merged = {...target.links, ... target.referers};

        Object.entries(merged)
          .forEach( ([targetUri, edgeInfo]) => {

            // 自分へのエッジは無視する
            if (target.nodeHash != targetUri) {

              const n = nodes[targetUri]
              if (n) {
                // 対象ノードへのラベルの数だけまわす
                Object.entries(edgeInfo).forEach( ([hash, weight]) => {
                  const distX = n.x - target.x
                  const distY = n.y - target.y

                  fx += BOUNCE * distX
                  fy += BOUNCE * distY
                })
              }
            }
        })

        // 減衰速度を計算する
        vx = (target.vx + fx) * ATTENUATION
        vy = (target.vy + fy) * ATTENUATION
      }

      // canvasの端を考慮して移動量を反射させる
      //if (target.x + vx <= 0) { vx = -vx }
      //if (width <= target.x + vx ) { vx = -vx }
      //if (target.y + vy <= 0) { vy = -vy }
      //if (height <= target.y + vy) { vy = -vy }

      // 座標更新したノード情報を返す
      return [key, {
          movable: target.movable,
          nodeHash: target.nodeHash,
          title: target.title,
          thumbnail: target.thumbnail,
          vx: vx,
          vy: vy,
          x: target.x + vx,
          y: target.y + vy,
          links: target.links,
          referers: target.referers,
        }]
  })

  // 更新を適応したあたらしいグラフインスタンスを生成する
  return Object.fromEntries(ret)
}

class SingleNodeTargetScopeGraph {
  private graphNodes: {[hash: string]: GraphNode} = {}
  private nodes: ForceGarphNodeDict = {}
  private graph: Graph | undefined
  private graphId: number = -1
  // グラフの構築中か
  private isRebuilding: boolean = false
  // 前回のグラフ計算が終わっていなければアップデートを飛ばすためのフラグ
  private updataing: boolean = false

  /**
   * 依存はコンストラクタだけで完了させる
   * @param target 
   * @param fetchNode 
   * @param canvasManager 
   * @param onNodeSelectedOfView 
   */
  constructor (
    private target: Node,
    private fetchNode = async (uri: string): Promise<Node | undefined> => { return undefined },
    private canvasManager: CanvasManager,
    private onNodeSelectedOfView: (node: Node) => void,
    private nextGraphRender: (hash: string) => void
  ){

    if (target.hash != "545ea538461003efdc8c81c244531b003f6f26cfccf6c0073b3239fdedf49446") {
      this.nodes[target.hash] = NodeToForceNode(target)
      if (canvasManager.graphCanvas) {
        this.nodes[target.hash].x = canvasManager.graphCanvas.width/2
        this.nodes[target.hash].y = canvasManager.graphCanvas.height/2
      }
    }
  }

  /**
   * 指定ノードの参照と被参照をまとめたうえで自分へのリンクを抜いたリストを取得する。
   * @param n 
   */
  public edges = (n: Node): [string, Edge][] => {
    const ret = {...n.vector, ...n.referers}
    delete ret[n.hash]
    return Object.entries(ret)
  }

  /**
   * このクラス内で発生したイベントの登録等を開放する
   */
  public removeDependancy = () => {
    if (isNull(this.graph)) { return }

    this.canvasManager.removeEventListner('mousemove', this.graph.pointing_check)
    this.canvasManager.removeEventListner('mousedown', this.graph.drag_start)
    this.canvasManager.removeEventListner('mouseup', this.graph.drag_end)
    this.canvasManager.removeEventListner('dblclick', this.graph.doubleClick)
  }

  /**
   * コンストラクタで入力された情報から初期化
   */
  public reset = async () => {
    const links = this.edges(this.target)//Object.entries(this.target.vector).concat(Object.entries(this.target.referers))
    const tempNodeDict: ForceGarphNodeDict = {}

    if (this.target.hash != "545ea538461003efdc8c81c244531b003f6f26cfccf6c0073b3239fdedf49446") {

      const criteria = NodeToForceNode(this.target)
      criteria.movable = false
      tempNodeDict[this.target.hash] = criteria
    }
    // とりあえず一周分のノードを取得
    for await (const [hash, edge] of links) {
      const a = await this.fetchNode(hash)

      if (a) {
        if (a.hash != "545ea538461003efdc8c81c244531b003f6f26cfccf6c0073b3239fdedf49446") {
          tempNodeDict[a.hash] = NodeToForceNode(a)
        }
      }
    }

    if (this.canvasManager) {
      if (this.graph) {
        // 既にグラフインスタンスがある
      } else {
        // グラフインスタンスを新規作成する
        this.graph = new Graph(
          this.canvasManager.id(), 
          30, 
          true, 
          false, 
          null, 
          this.activateNodeCallback, 
          this.deActivateNodeCallback,
          this.doubleClickedNodeCallback,
        )

        this.graphId = this.graph.id
        this.canvasManager.addEventListner('mousemove', this.graph.pointing_check)
        this.canvasManager.addEventListner('mousedown', this.graph.drag_start)
        this.canvasManager.addEventListner('mouseup', this.graph.drag_end)
        this.canvasManager.addEventListner('dblclick', this.graph.doubleClick)
      }
      this.rebuildGraph(this.nodes, tempNodeDict)
    }
  }

  /**
   * レンダリングされたグラフでノードに対して干渉があった時のイベント
   */
  private activateNodeCallback = async ( deactivateNode: GraphNode | null | undefined, activateNode: GraphNode ) => {
    const node = await this.fetchNode(activateNode.hash)
    if (node) {
      this.onNodeSelectedOfView(node)
    }
  }

  private deActivateNodeCallback = (deactivateNode: GraphNode ) => {
  }


  private doubleClickedNodeCallback = (node: GraphNode) => {
    this.nextGraphRender(node.hash)
  }

  public reload = async () => {
    const relaodedTarget = await this.fetchNode(this.target.hash) 
    if (relaodedTarget) this.target = relaodedTarget
    await this.reset()
  }

  public graphUpdateTimer = 0

  public update = () => {
    if (this.isRebuilding) return
    if (this.updataing) {
      console.warn("前回のグラフアップデートが許容時間内に終了していないっぽい")
      return
    }
    this.updataing = true
    this.ToStableGraph()
    this.updataing = false
  }

  /**
   * 描画
   */
  public draw = () => {
    if (this.graph) {
      (this.graph as any).draw()
    }
  }


  /**
   * グラフ配置更新
   */
  ToStableGraph = () => {
    // 現在座標を取得
    Object.entries(this.graphNodes).forEach( ([hash, graphNode]) => {
      this.nodes[hash].x = graphNode.x
      this.nodes[hash].y = graphNode.y
    })
    // 計算
    this.nodes = ForceGraphUpdate(this.nodes, this.canvasManager.height(), this.canvasManager.width())
    // 描画ノードに反映させる
    Object.entries(this.nodes).forEach( ([hash, node]) => {
      this.graphNodes[hash].x = node.x
      this.graphNodes[hash].y = node.y
    })
  }


  /**
   * このスコープのグラフ描画データを再構築する
   * インスタンスのもっているnodesグラフ情報を元に座標だけ引き継がせる
   * 強制的にさせたい場合はbeforeNodesに空の連想配列を指定する
   * @param nodes 
   */
  rebuildGraph = (beforeNodeDict: ForceGarphNodeDict, nodes: ForceGarphNodeDict) => {
    if (isNull(this.graph)) return
    this.isRebuilding = true

    // グラフ初期化
    Graph.Clear(this.graphId)
    this.graphNodes = {}

    const graph = this.graph

    // ノードを配置
    Object.values(nodes).forEach (forceNode => {
      if (beforeNodeDict[forceNode.nodeHash]) {
        // 以前も存在していれば座標をひきつぐ
        forceNode.x = beforeNodeDict[forceNode.nodeHash].x
        forceNode.y = beforeNodeDict[forceNode.nodeHash].y
      } else {
        forceNode.x = RangeRandom(0, this.canvasManager.width())
        forceNode.y = RangeRandom(0, this.canvasManager.height())
      }

      const graphNode = graph.node(forceNode.x, forceNode.y, 40, "", forceNode.nodeHash)
      console.log(`make node ${forceNode.title}`)

      if (isNull(graphNode)) return undefined
      if (forceNode.thumbnail != "") {
        graphNode.setImage(forceNode.thumbnail)
      } else {
        graphNode.setText(forceNode.title)
      }
      this.graphNodes[forceNode.nodeHash] = graphNode 
    })

    // エッジを張る
    Object.values(nodes).forEach( forceNode => {
      Object.entries(forceNode.links).forEach( ([key, edge]) => {
       const target = nodes[key]

        // スコープ内にエッジの先のノードが存在すればエッジを張る
        if (!isNull(target) && this.graphNodes[target.nodeHash] && forceNode.nodeHash != target.nodeHash) {
          const t = target
          console.log(`make edge ${forceNode.title} -> ${t.title}`)
          Object.entries(edge).forEach( ([label, weight]) => {
            //this.graphNodes[forceNode.nodeHash].biDirectional(this.graphNodes[t.nodeHash], label)
            this.graphNodes[forceNode.nodeHash].biDirectional(this.graphNodes[t.nodeHash], "")
          })
        }
      })
    })

    // 更新後のグラフを設定する
    this.nodes = nodes
    this.isRebuilding = false
  }
}

class NoScopeGraph {
  public init = () => {}
  public update = () => {}
  public reload = async () => {}
  public draw = () => {}
  public removeDependancy = () => {}
}

export class ScopeGraphManager {
  public bufferSize = 10
  // リングバッファにしたい
  public history: SingleNodeTargetScopeGraph[] = Array<SingleNodeTargetScopeGraph>()
  public historyIndex: number = -1
  // とりあえずなんもグラフを使わないスコープを初期スコープとしてもつ
  public currentScopeGraph: SingleNodeTargetScopeGraph | NoScopeGraph = new NoScopeGraph()
  public fetchNode = async (hash: string): Promise<Node | undefined> => { return undefined}

  public canvasManager: CanvasManager | undefined
  public store: StoredNodes | undefined
  public onNodeSelectedOfView: (node: Node) => void  = () => {}


  constructor () {
  }


/**
   * 依存モジュールをつっこみなおす
   * @param canvas 
   * @param store 
   */
  public dependancyModuleInjection(canvas: CanvasManager, store: StoredNodes, onNodeSelectedOfView: (node: Node) => void) {
    this.canvasManager = canvas
    this.store = store
    this.onNodeSelectedOfView = onNodeSelectedOfView
  }


  // 将来的には宣言的な集合表現をビューに与えるといいかんじにレンダリングするようになってほしい
  public restart = async (hash: string) => {
    const node = await this.store?.fetch(hash)
    if (isNull(node)) {
    console.warn(`指定ハッシュ: ${hash} でノードをフェッチできませんでした`)
      return false
    }
    if (isNull(this.canvasManager) || isNull(this.store) || isNull(this.onNodeSelectedOfView)) {
      console.warn("必要な依存が注入されていません")
      return false
    }

    this.canvasManager.removeAllEventListner()
    const scope = new SingleNodeTargetScopeGraph(
      node,
      this.store.fetch,
      this.canvasManager,
      this.onNodeSelectedOfView,
      this.restart
    )
    if (scope) {
      await scope.reset()
      this.pushScope(scope)
    }
    return true
  }

  /**
   * カレントスコープをスタックに追加する(予定)
   */
  public pushScope(scope: SingleNodeTargetScopeGraph) {
    // 直前のスコープの開放処理を行う
    this.currentScopeGraph.removeDependancy()
    // カレントにセット
    this.currentScopeGraph = scope
  }

  public update = () => {
    this.currentScopeGraph.update()
  }

  public draw = () => {
    this.currentScopeGraph.draw()
  }

  public currentScopeReload = async () => {
    await this.currentScopeGraph.reload()
  }
}

export class StoredNodes {
  // ノード辞書
  private dict: NodeDictionary = {}
  private onRegister = (): void => {}
  constructor() {
  }

  /**
   * tagHashDictはtitleが一意なことを保証する(したい)、あとdatalistに使う都合上、keyをtitleにおきかえる
   */
  tagHashDict = (): NodeDictionary => {
    return Object.fromEntries(
      Object.entries(this.dict).filter(([key, value]) => value.type == "TagMeta")
        .map(([key, value]) => [value.title, value]),
    );
  };

  blobHashDict = (): NodeDictionary => {
    return Object.fromEntries(
      Object.entries(this.dict).filter(([key, value]) => value.type == "BlobMeta"),
    );
  };

  /**
   * 指定hashのノードを取得する
   */
  public fetch = async (hash: string): Promise<Node | undefined> => {
    if (!this.dict[hash]) {
      const updateNodes = await this.remoteGet(hash)
      // キャッシュ
      updateNodes.forEach( e => this.cache(e))
    }
    return this.dict[hash];
  }

  public update = async (node: Node, optionFormData: FormData): Promise<Node[]> => {
    if (JSON.stringify(node) != JSON.stringify(this.dict[node.hash])) {
      // 差分が発生したのでPUTリクエストを送信する
      const updateNodes = await this.remotePut(node, optionFormData)
      // キャッシュ
      updateNodes.forEach( e => this.cache(e))
      //return Object.fromEntries(updateNodes.map(e => [e.hash, e]))
      return updateNodes
    } else {
      return []
    }
  }

  /**
   * formDataにnode情報をまぜて送信する
   * @param node 
   * @param formData 
   */
  private remotePut = async (
    node: Node,
    optionFormData: FormData
  ): Promise<Node[]> => {
    optionFormData.set("meta", JSON.stringify(node))
    console.log({...optionFormData})
    const response = await PutRequest(
      "/posts/" + node.hash,
      optionFormData,
    );

    if (isNull(response)) return []
    const json = await response.json()
    console.log(json);

    // レスポンスの連想配列からノード集合以外をとりのぞく
    const nodes = Object.values(json).filter(( node ): node is Node => {
      const result = Node.validation(node)
      if (!result) throw new Error('バリデーション不能なjsonが混入しています')
      return result
    })
    return nodes
  }

  /**
   * 登録時に値の追加、更新が入った場合、PUTリクエストを送る
   * @param e 
   */
  private cache = (e: Node): void => { 
    this.dict[e.hash] = e
    this.onRegister()
  }

  private remoteGet = async(
    hash: string,
    force = false,
  ): Promise<Node[]> =>  {
    const pathStruct = metaResourcePath(hash)
    const path = pathStruct.prefix + pathStruct.hashDir + pathStruct.hash + pathStruct.extention
    const response = await GetRequest(path);
    //const response = await GetRequest( "/posts/" + hash )
    if (isNull(response)) return []
    const json = await response.json();
    console.log(json);

    if (Node.validation(json)) {
      console.log(`remoteGet: ${json}`)
      const nodeArray = [json]
      return nodeArray
    } else {
      console.warn("Nodeとして解釈できないものを取得しました")
      return []
    }

    // レスポンスの連想配列からノード集合以外をとりのぞく
    //const nodes = Object.values(json).filter(( node ): node is Node => {
    //  const result = Node.validation(node)
    //  if (!result) throw new Error('バリデーション不能なjsonが混入しています')
    //  return result
    //})

  }
}







class SingleFileUploader {
  public baseElement: HTMLDivElement | undefined
  private textArea: HTMLTextAreaElement | undefined
  private requestButton: HTMLButtonElement | undefined
  private fileArea: HTMLInputElement | undefined
  private previewArea: HTMLImageElement | undefined
  private previewCanvas: HTMLCanvasElement | undefined
  constructor (
    private document: HTMLDocument,
    private parentNode: HTMLElement,
    private updateNode: (e: Node, optionFormData: FormData) => Promise<Node[]>,
    private reload: () => void
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

    this.textArea = CreateTextArea(document,'{"title": "", "content": ""}', 30, 10)
    a.appendChild(this.textArea)

    this.previewArea = document.createElement("img")
    this.previewArea.classList.add("uploaderPreview")
    a.appendChild(this.previewArea)



    a.addEventListener('drop', this.dropCallback)

    a.addEventListener('dragover', function(evt){
      evt.preventDefault();
      a.classList.add('dragover');
    });
    a.addEventListener('dragleave', function(evt){
        evt.preventDefault();
        a.classList.remove('dragover');
    });

    this.previewCanvas = document.createElement('canvas')
    this.previewCanvas.classList.add("uploaderPreview")
    //a.appendChild(this.previewCanvas)
  }

  dropCallback = async (evt: DragEvent) => {
    if (
      isNull(evt.dataTransfer) ||
      isNull(this.textArea) ||
      isNull(this.fileArea) ||
      isNull(this.baseElement)
    ) {return}

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

    const entries = types.map(type => {return [type, dataTransfer.getData(type)]})

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
              const uris:string[] = []
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
    const file = new File([blob], v4.generate(), {type: blob.type})
    const dt = new DataTransfer()
    dt.items.add(file);
    this.setFiles(dt.files)
  }

  setFiles = (files: FileList) => {
    if (isNull(this.fileArea)) return 
    this.fileArea.files = files;
    this.onChangeJsonUpdateWhenFileSelect(files)
  }

  sendCallback = async () => {
    if ( isNull(this.textArea) ) return 
    if ( isNull(this.fileArea) ) return
    if ( isNull(this.fileArea.files)) return

    const node = JSON.parse(this.textArea.value)
    if (!BlobMeta.validation(node)) {
      console.warn(`blobmetaと解釈できませんでした ${node}`)
      return
    }

    const formData = new FormData();

    formData.set("meta", JSON.stringify(this.textArea.value));
    formData.set("file", this.fileArea.files[0]); // ファイル内容を詰める

    const result = await this.updateNode(node, formData)
    if (result.length) {
      this.reload()
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
    const extention = (isNull(splitedName.extention) || splitedName.extention == "")? MIMEtoExtentionMap[file.type]:splitedName.extention
    if (isNull(extention) ) {
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
    const blobUrl = window.URL.createObjectURL( file ) ;
    if (this.previewArea) {
      this.previewArea.src = blobUrl
    }


    const createThumbnailAndPrepareJson = () => {
      const ctx = this.previewCanvas?.getContext('2d') 
      if (isNull(this.previewCanvas) || isNull(ctx)) return
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
      ctx.drawImage(img, 0,0, width * rate, height)
      ctx.clearRect(0,0,width, height)
      ctx.drawImage(img, 0,0,img.width, img.height, 0,0,width,height)

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
const ContentTypeToMimeType =  (contentType: string): string | undefined => {
  return Object.entries(MIMEtoExtentionMap).filter(([key, value]) => {
    return contentType.includes(key)
  })[0][0]
}


/**
 * MIMETYPEから拡張子を取得する
 * 辞書内に存在しなければundefinedを返す
 */
const MIMEtoExtentionMap: { [key: string]: string } = {
  "text/html" : ".html",
  "image/png" : ".png",
  "image/jpeg" : ".jpeg",
  "image/gif" : ".gif",
}

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
    } else {

    }
  }
}


/**
 * UListを受けとってNodeインスタンスを組みたてる
 * @param html 
 */
const UListToNode = (html: HTMLUListElement): Node | undefined => {
  const a = parseHtmlElement (html)
    
  if (Node.validation(a)) {
    return a
  } else {
    return undefined
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
 * /LocalMenu
 *  /NodeDetail
 */
export class LocalMenu extends HTMLDivElement {
  detail: NodeDetail | undefined
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

    this.detail = new NodeDetail(
      document.createElement('p'),
      document.createElement('p'),
      document.createElement('a'),
      document.createElement('a'),
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


/**
 *  /thumbnail
 *  /title
 *  /description
 *  /tag
 *    /tag-a
 *    /tag-b
 *  /originalLink
 *  /downloadLink
 *  /jsonTextArea
 */
export class NodeDetail extends HTMLDivElement {
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
    private downloadLinkElement: HTMLAnchorElement,
    private orgmodeLinkElement: HTMLAnchorElement,
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

    this.downloadLinkElement.href = "download"
    this.appendChild(this.downloadLinkElement)

    this.orgmodeLinkElement.href = "#"
    const textNode = document.createTextNode("This is orgmode link")

    this.orgmodeLinkElement.appendChild(textNode)
    this.orgmodeLinkElement.title = "This is orgmode link"
    this.appendChild(this.orgmodeLinkElement)


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
    this.orgmodeLinkElement.href = orgPathData.prefix + orgPathData.hashDir + orgPathData.hash + orgPathData.extention
    this.downloadLinkElement.href = "にゃーん"
    this.downloadLinkElement.textContent = "ダウンロード"
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
    const node = bufferToHash("node")
    //const tag = bufferToHash("tag")
    //const blob = bufferToHash("blob")
    //const entryPoint = bufferToHash("entryPoint")

    // initialノード
    const n = node

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
    customElements.define('node-detail-div', NodeDetail, {extends: 'div'})

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
 * 子要素を全て削除する
 * @param target 
 */
const removeAllChild = (target: Element) => {
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }
}