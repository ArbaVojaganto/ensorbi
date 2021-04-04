
/// <reference lib="dom" />

// 参考: https://qiita.com/PG0721/items/92d54c9f2a57ec9109b8


import {
  EventDispatcher,
  //Event
} from "./EventDispatcher.ts"


/**
 * 矩形
 * ex. ワールド座標系の表示領域やスクリーン座標系の大きさなどを示すために使用
 */
type Rect = { x: number, y: number, w: number, h: number }

/**
 * 二次元座標
 * ex. スクリーン座標をワールド座標にする時等に使用
 */
type Vector = { x: number, y: number }

/**
 * 行列、ここでは任意の型で大きさ9の1次元配列で使用
 */
type TMatrix<T> = [T, T, T, T, T, T, T, T, T]
type Matrix = TMatrix<number>

const isMatrix = (o: Matrix | Vector): o is Matrix => {
  if (Array.isArray(o)) {
    return true
  } else {
    return false
  }
}

/**
 * 行列に対して右からベクトルをかける
 * @param m0 行列
 * @param m1 ベクトル
 * @returns ベクトル
 */
const multiplyVector = (m0: Matrix, m1: Vector): Vector => {
  return {
    x: m0[0] * m1.x + m0[1] * m1.y + m0[2],
    y: m0[3] * m1.x + m0[4] * m1.y + m0[5],
  };
}

/**
 * 行列に対して右から行列をかける
 * @param m0 行列
 * @param m1 行列
 * @returns 行列
 */
const multiplyMatrix = (m0: Matrix, m1: Matrix): Matrix => {
  return [
    m0[0] * m1[0] + m0[1] * m1[3] + m0[2] * m1[6],
    m0[0] * m1[1] + m0[1] * m1[4] + m0[2] * m1[7],
    m0[0] * m1[2] + m0[1] * m1[5] + m0[2] * m1[8],
    m0[3] * m1[0] + m0[4] * m1[3] + m0[5] * m1[6],
    m0[3] * m1[1] + m0[4] * m1[4] + m0[5] * m1[7],
    m0[3] * m1[2] + m0[4] * m1[5] + m0[5] * m1[8],
    m0[6] * m1[0] + m0[7] * m1[3] + m0[8] * m1[6],
    m0[6] * m1[1] + m0[7] * m1[4] + m0[8] * m1[7],
    m0[6] * m1[2] + m0[7] * m1[5] + m0[8] * m1[8],
  ]
}

/**
 * 指定座標に移動させるために行列を取得
 * @param x 
 * @param y 
 * @returns 行列
 */
const translateMatrix = (x: number, y: number): Matrix => {
  return [1, 0, x, 0, 1, y, 0, 0, 1]
}

/**
 * 指定倍率に拡大率を変化させる行列を取得
 * @param x 
 * @param y 
 * @returns 
 */
const scaleMatrix = (x: number, y: number): Matrix => {
  return [x, 0, 0, 0, y, 0, 0, 0, 1]
}


/**
 * canvasの管理
 * 拡縮等の操作イベントを受けとり、適応させる
 */
export class CanvasManager extends EventDispatcher {
  graphCanvas: HTMLCanvasElement | undefined
  // 平行移動中かどうかのフラグ
  _translating = false
  // 平行移動時の一つ前の座標
  _prePos: Vector = { x: 0, y: 0 }        // 
  // 再描画フラグ
  _redrawFlag = true
  // 射影行列
  _m: Matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  // 射影行列の逆行列
  _inv: Matrix = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  // ビューボリューム
  _vv: Rect = { x: 0, y: 0, w: 0, h: 0 }
  // ビューポート
  _vp: Rect = { x: 0, y: 0, w: 0, h: 0 }
  // windowリサイズ時に使用するタイマーのID
  _resizeTimeoutId = -1
  // windowリサイズ時のビューボリューム更新メソッドの種類
  _resizeType = 'no scaleMatrix top left'

  width = () => { return (this.graphCanvas)? this.graphCanvas.width: -1 }
  height = () => { return (this.graphCanvas)? this.graphCanvas.height: -1 }
  id = () => { return (this.graphCanvas)? this.graphCanvas.id: "" }

  constructor(private document: HTMLDocument, private rootNode: Element) {
    super()

    // キャンバスを追加
    this.graphCanvas = document.createElement("canvas")
    // 表示サイズ
    this.graphCanvas.style.width = window.innerWidth + 'px'
    this.graphCanvas.style.height = window.innerHeight + 'px'

    // 描画バッファ
    this.graphCanvas.width = Math.floor(window.innerWidth * window.devicePixelRatio)
    this.graphCanvas.height = Math.floor(window.innerHeight * window.devicePixelRatio)


    this.graphCanvas.id = "network-graph-canvas"

    rootNode.appendChild(this.graphCanvas)
  }


  /**
   * 初期化処理
   */
  init = () => {
    this.initModel()
    this.updateDom()
    this.initController()
  }



  /**
   * 拡縮移動可能なCanvas(モデル)の初期化
   */
  initModel = () => {
    this._translating = false
    // 初回描画のためにtrueにしておく
    this._redrawFlag = true
    this._resizeTimeoutId = -1
    this._resizeType = 'no scaleMatrix top left'

    // ビューポートとビューボリュームを初期化する
    this.updateViewPort()
    this._vv = { x: 0, y: 0, w: this._vp.w, h: this._vp.h }
    // 射影行列と射影行列の逆行列を更新する
    this.updatePrjMatrix()
  }


  /**
   * コントローラーの初期化
   * @returns 
   */
  initController = () => {
    if (!this.graphCanvas) { return }

    // ダブルクリックイベント
    this.graphCanvas.addEventListener('dblclick', e =>{
      // ブラウザのデフォルト動作を抑止する
      e.preventDefault()

      const event = {type: 'dblclick', which: e.which}
      super.dispatchEvent(event)
    })

    // マウス押下イベント
    this.graphCanvas.addEventListener('mousedown', e => {
      // ブラウザのデフォルト動作を抑止する
      e.preventDefault()

      // リサイズ処理待ち
      if (this._resizeTimeoutId !== -1) { return }
      if (this._translating) { return }

      if (e.shiftKey) {
        this._translating = true
      }

      // スクリーン座標系のカーソルの座標を取得する
      const cursorPos = { x: e.pageX, y: e.pageY }

      // スクリーン座標系のカーソル座標からcanvasワールド座標系の座標を取得
      this._prePos = this.screenToWorld(cursorPos)


      const event = {type: 'mousedown', which: e.which}
      super.dispatchEvent(event)
    })


    /**
     * マウス移動時イベント
     * マウス押下中に発生した場合は、平行移動処理を行う
     */
    this.graphCanvas.addEventListener('mousemove', e => {

      const cursorPos = { x: e.pageX, y: e.pageY }
      // スクリーン座標系のカーソルの座標を取得
      const curPos = this.screenToWorld(cursorPos)

      if (this._translating) {
      // 平行移動する
      this.translate(
        {
          x: this._prePos.x - curPos.x,
          y: this._prePos.y - curPos.y
        })

      // カーソルの座標をワールド座標系へ変換
      this._prePos = this.screenToWorld(cursorPos)

      // 再描画フラグを立てる
      this._redrawFlag = true

      } else {

        const event = {type: 'mousemove', which: e.which, x: curPos.x, y: curPos.y}
        super.dispatchEvent(event)

      }

    })



    /**
     * マウス離上イベント
     */
    this.graphCanvas.addEventListener('mouseup', e => {
      this._translating = false
      const event = {type: 'mouseup', which: e.which}
      super.dispatchEvent(event)
    })



    /**
     * マウスホイールイベント
     * Canvasの拡縮処理を行う
     */
    this.graphCanvas.addEventListener('mousewheel', (e: any) => {

      // リサイズ処理待ち
      if (this._resizeTimeoutId !== -1) { return }

      // スクリーン座標系のカーソルの座標を取得
      const cursorPos = { x: e.pageX, y: e.pageY }

      // スクリーン座標系をワールド座標系に変換
      const curPos = this.screenToWorld(cursorPos)

      // 奥へ動かす -> 拡大する -> ビューボリュームを縮小する
      // 手前へ動かす -> 縮小する -> ビューボリュームを拡大する
      const rate = (e.wheelDelta > 0) ? 1 / 1.2 : 1.2

      // 拡縮する
      this.scale(curPos, rate)

      // 再描画フラグを立てる
      this._redrawFlag = true
    })


    /**
     * ウィンドウのリサイズ処理
     */
    this.graphCanvas.addEventListener('resize', (e: any) => {
      // リサイズイベント毎に処理しないように少し時間をおいて処理する
      if (this._resizeTimeoutId !== -1) {
        clearTimeout(this._resizeTimeoutId)
        this._resizeTimeoutId = -1
      }
      this._resizeTimeoutId = setTimeout(() => {
        // 実際にはリサイズ処理の選択機能は殺している
        if (this._resizeType === 'scaleMatrix center') {
          this.resizeScaleCenter();
        } else if (this._resizeType === 'scaleMatrix top left') {
          this.resizeScaleTopLeft();
        } else if (this._resizeType === 'no scaleMatrix center') {
          this.resizeNoScaleCenter();
        } else if (this._resizeType === 'no scaleMatrix top left') {
          this.resizeNoScaleTopLeft();
        }
        this.updateDom()
        this._redrawFlag = true
        this._resizeTimeoutId = -1
      }, 500)
    })

  }



  /**
   * ビューポートの更新
   */
  updateViewPort = () => {
    this._vp = {
      x: 0,
      y: 0,
      w: window.innerWidth * window.devicePixelRatio,
      h: window.innerHeight * window.devicePixelRatio
    }
  }

  /**
   * 現在のビューポート座標とビューボリューム座標を相互に変換するための射影行列を計算する
   */
  updatePrjMatrix = () => {
    // ビューボリュームの左上隅を原点へ移動する
    const trans = translateMatrix(-this._vv.x, -this._vv.y)
    // ビューボリュームの左上隅を原点へ移動する逆行列を求める
    const invTrans = translateMatrix(this._vv.x, this._vv.y)
    // ビューボリュームの拡大縮小し、ビューポートにフィットような行列を求める
    const scale = scaleMatrix(this._vp.w / this._vv.w, this._vp.h / this._vv.h)
    const invScale = scaleMatrix(this._vv.w / this._vp.w, this._vv.h / this._vp.h)   // ビューボリュームの拡大縮小し、ビューポートにフィットような行列の逆行列を求める
    // 射影行列を更新する
    this._m = multiplyMatrix(scale, trans)
    // 射影行列の逆行列を更新する        
    this._inv = multiplyMatrix(invTrans, invScale)
  }

  /**
   * リサイズ
   * ビューボリュームの矩形の中心が変わらないように更新する
   */
  resizeScaleCenter = () => {
    // 変更前の拡大率を求める
    const rate = { x: this._vv.w / this._vp.w, y: this._vv.h / this._vp.h }
    const vvsq = { x: 0, y: 0, size: 0 }

    if (this._vv.w > this._vv.h) {
      // 横長
      vvsq.y = this._vv.y
      vvsq.size = this._vv.h
      vvsq.x = this._vv.x + (this._vv.w - vvsq.size) / 2
    } else {
      // 縦長
      vvsq.x = this._vv.x
      vvsq.size = this._vv.w
      vvsq.y = this._vv.y + (this._vv.h - vvsq.size) / 2
    }

    // ビューポートの更新
    this.updateViewPort()

    // ビューボリュームの更新
    const aspect = this._vp.w / this._vp.h
    if (aspect > 1) {
      // 横長
      this._vv.y = vvsq.y
      this._vv.h = vvsq.size
      this._vv.x = vvsq.x - (vvsq.size * aspect) / 2 + vvsq.size / 2
      this._vv.w = vvsq.size * aspect
    } else {
      // 縦長
      this._vv.x = vvsq.x
      this._vv.w = vvsq.size
      this._vv.y = vvsq.y - (vvsq.size / aspect) / 2 + vvsq.size / 2
      this._vv.h = vvsq.size / aspect
    }

    // 射影行列と射影行列の逆行列を更新する   
    this.updatePrjMatrix()
  }

  /**
   * リサイズ
   * ビューボリュームの矩形の左上隅が変わらないように更新する
   */
  resizeScaleTopLeft = () => {
    // 変更前の拡大率を求める
    const rate = { x: this._vv.w / this._vp.w, y: this._vv.h / this._vp.h }
    const vvsq = { x: 0, y: 0, size: 0 }

    if (this._vv.w > this._vv.h) {// 横長
      vvsq.size = this._vv.h
    } else {// 縦長
      vvsq.size = this._vv.w
    }

    // ビューポートの更新
    this.updateViewPort()

    // ビューボリュームの更新
    const aspect = this._vp.w / this._vp.h
    if (aspect > 1) {// 横長
      this._vv.h = vvsq.size
      this._vv.w = vvsq.size * aspect
    } else {// 縦長
      this._vv.w = vvsq.size
      this._vv.h = vvsq.size / aspect
    }

    // 射影行列と射影行列の逆行列を更新する   
    this.updatePrjMatrix()
  }

  /**
   * リサイズ
   * 矩形の中央を中心に何も変化がないように見せる
   */
  resizeNoScaleCenter = () => {
    // 変更前の拡大率を求める
    const rate = { x: this._vv.w / this._vp.w, y: this._vv.h / this._vp.h }    // rate.xはrate.yと等しいんだけど、一応xもyも求めておく
    // 変更前のビューボリュームの中心点を求める
    const oldCenter = {
      x: this._vv.x + this._vv.w / 2,
      y: this._vv.y + this._vv.h / 2
    }
    // ビューポートの更新
    this.updateViewPort()

    // ビューボリュームの更新(幅と高さのみ更新する)
    this._vv.w = this._vp.w * rate.x
    this._vv.h = this._vp.h * rate.y
    this._vv.x = oldCenter.x - this._vv.w / 2
    this._vv.y = oldCenter.y - this._vv.h / 2

    // 射影行列と射影行列の逆行列を更新する   
    this.updatePrjMatrix()
  }

  /**
   * リサイズ
   * 矩形の左上隅を中心に何も変化がないように見せる
   */
  resizeNoScaleTopLeft = () => {
    // 変更前の拡大率を求める
    const rate = { x: this._vv.w / this._vp.w, y: this._vv.h / this._vp.h }    // rate.xはrate.yと等しいんだけど、一応xもyも求めておく

    // ビューポートの更新
    this.updateViewPort()

    // ビューボリュームの更新(幅と高さのみ更新する)
    this._vv.w = this._vp.w * rate.x
    this._vv.h = this._vp.h * rate.y

    // 射影行列と射影行列の逆行列を更新する   
    this.updatePrjMatrix()
  }

  /**
   * ビューボリュームの平行移動
   * @param vec 
   */
  translate = (vec: Vector) => {
    // ビューボリュームを更新
    this._vv.x += vec.x
    this._vv.y += vec.y
    // 射影行列と射影行列の逆行列を更新する
    this.updatePrjMatrix()
  }

  /**
   * ビューボリュームの拡大縮小
   * @param center 
   * @param rate 
   */
  scale = (center: Vector, rate: number) => {
    let topLeft = { x: this._vv.x, y: this._vv.y }
    let mat: Matrix
    // 中心座標を原点へ移動する
    mat = translateMatrix(-center.x, -center.y)
    // 拡縮する
    mat = multiplyMatrix(scaleMatrix(rate, rate), mat)
    // 原点を中心座標へ戻す
    mat = multiplyMatrix(translateMatrix(center.x, center.y), mat)
    // 行列を適応する
    topLeft = multiplyVector(mat, topLeft)

    // ビューボリューム更新
    this._vv.x = topLeft.x
    this._vv.y = topLeft.y
    this._vv.w *= rate
    this._vv.h *= rate

    // 射影行列と射影行列の逆行列を更新する
    this.updatePrjMatrix()
  }


  /**
   * スクリーン座標をワールド座標へ変換する
   * @param screenPos 
   * @returns 
   */
  screenToWorld = (screenPos: Vector): Vector => { return multiplyVector(this._inv, screenPos) }


  /**
   * ビューの更新
   * @returns 
   */
  updateDom = () => { 
    if (!this.graphCanvas) { return }
    this.graphCanvas.width = this._vp.w
    this.graphCanvas.height = this._vp.h

    // リサイズタイプの設定(初期化時のみ)
  }

  /**
   * ビューの再描画
   * @returns 
   */
  updateView = () => {
    if (!this.graphCanvas) return
    const ctx = this.graphCanvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    // 直前のビューポートの大きさ分描画バッファをクリアする
    ctx.clearRect(this._vv.x,this._vv.y, this._vv.w, this._vv.h)
    ctx.setTransform(this._m[0], this._m[3], this._m[1], this._m[4], this._m[2], this._m[5])
  }

  /**
   * 再描画処理
   * requestanimationframeは親オブジェクトで行うので再描画処理だけを定義
   */
  update = () => {
    //if (this._redrawFlag) {// 再描画する
      this.updateView()
      this._redrawFlag = false
    //}
  }

  /**
   * Canvasインスタンスを取得する
   * @returns 
   */
  getGraphCanvas = (): HTMLCanvasElement | undefined => {
    return this.graphCanvas
  }
}
