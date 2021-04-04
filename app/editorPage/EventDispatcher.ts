

type Listner = { oneShot: Boolean, callback: any }

// 既存のイベントオブジェクトをそのままディスパッチしたかったのでとりあえずEventオブジェクトはなんでも受けいれるように...
//export type Event = { type: string, propety: NonNullable<any> }

/**
 * 簡易的なイベントシステム
 */
export class EventDispatcher {
    private ListnersMap: {[key: string]: Array<Listner>} = {}

    private getListeners = (eventType: string) => {
        if(!this.ListnersMap[eventType]) {
            this.ListnersMap[eventType] = []
        }
        return this.ListnersMap[eventType]
    }

    /**
     * コールバックを指定イベントタイプのリスナに登録する
     * @param eventType 
     * @param callback 
     * @param options 
     */
    addEventListner(eventType: string, callback: any, options:{ oneShot?: boolean} = {}) {
        const listner: Listner = {
            oneShot: !!options.oneShot,
            callback: callback,
        }

        this.getListeners(eventType).push(listner)
    }

    /**
     * 指定イベントタイプの指定コールバックをリスナーから削除する
     * @param eventType 
     * @param callback 
     */
    removeEventListner(eventType: string, callback: any) {
        const listnerList = this.getListeners(eventType)
        const index = listnerList.findIndex((listner) => { listner === callback })
        if (index >= 0) {
            listnerList.splice(index, 1)
        }
    }

    /**
     * リスナー登録を全て削除する
     */
    removeAllEventListner() {
        this.ListnersMap = {}
    }

    /**
     * イベントを発火させる
     * @param event 
     */
    dispatchEvent(event: any) {
        const listnerList = this.getListeners(event.type)
        listnerList.forEach(e => {
            e.callback(event)
        })

        // oneShotで登録されていればはリスナー配列から消す
        const filtered = listnerList.filter((listner) => !listner.oneShot)
        this.ListnersMap[event.type] = filtered
    }
}