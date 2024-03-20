
/// <reference lib="dom" />

//import {MarkdownFolderMeta} from "./../models/MarkdownFolderMeta.ts"

// タイトル指定してシンボルノードを作成する
export const createMarkdownFolderRequsetUI = () => {
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

    const symbol = new MarkdownFolderMeta("", title.value, "", "", description.value, {}, remoteUri.value)
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


this.fileUploader = new SingleFileUploader(document, rootNode, updateNode, reload, this.restartScopeManager)
if (this.fileUploader.baseElement) {
  const menu = createAccordionMenu("singleFileUploader: ", [this.fileUploader.baseElement])
  rootNode.appendChild(menu)
}
this.multifileUploader = new MultiFileUploader(updateNode, reload, this.tagHashDict)
if (!isNull(this.multifileUploader)) {
  const menu = createAccordionMenu("multiFileUploader: ", [this.multifileUploader])
  rootNode.appendChild(menu)
}