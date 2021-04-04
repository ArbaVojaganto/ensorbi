
/// <reference lib="dom" />

import { EditorApplication } from "./EditorApplication.ts"


window.onload = () => {
    const container = document.querySelector("#network-graph")
    if (container) {
        const app = new EditorApplication(
            document,
            container
        )
        app.init()

    }
}

