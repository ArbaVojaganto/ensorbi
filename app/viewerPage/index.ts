
/// <reference lib="dom" />

import { ViewerApplication } from "./ViewerApplication.ts"


window.onload = () => {
    const container = document.querySelector("#network-graph")
    if (container) {
        const app = new ViewerApplication(
            document,
            container
        )
        app.init()

    }
}

