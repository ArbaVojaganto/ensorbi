
import { createApp } from "./deps.ts"
import { routes } from "./router.ts"
import { posts, StoredPosts, registerTagMeta } from "./StoredPosts.ts"
import { TagMeta } from "./../models/tags.ts"
import { bufferToHash } from "./../common/util.ts"
import { buildDenoDeployProject } from "./../viewerPage/viewerBundle.ts"


const startHttpServer = async () => {
    const app = createApp();
    // システムで要求されるタグが存在しなければ作成する
    if ( await posts.fetch(bufferToHash("node"))  == undefined ) await registerTagMeta( new TagMeta("", "node", "", "", "", {}, ""))
    if ( await posts.fetch(bufferToHash("tag"))  == undefined ) await registerTagMeta( new TagMeta("", "tag", "", "", "", {}, ""))
    if ( await posts.fetch(bufferToHash("blob"))  == undefined ) await registerTagMeta( new TagMeta("", "blob", "", "", "", {}, ""))
    if ( await posts.fetch(bufferToHash("entryPoint"))  == undefined ) await registerTagMeta( new TagMeta("", "entryPoint", "", "", "", {}, ""))

    app.route("/", routes());
    app.listen({ port: 8080 });
}

const reconstructReferrers = async () => {
    await posts.reconstructReferrers()
}

const migrationMetaFile = async () => {
    await posts.migrationMetaFile()
}

for await (const arg of Deno.args) {
    console.log(`arg: ${arg}`)
    switch(arg) {
        case "--http-server": {
            await startHttpServer()
            break
        }
        case "--reconstruct-referrers": {
            await reconstructReferrers()
            break
        }
        case "--migrate-meta-file": {
            await migrationMetaFile()
            break
        }
        case "--build-deno-deploy-project": {
            
            await buildDenoDeployProject("build/viewer/")
            break
        }
        default: {
            console.warn('許容できない引数が指定されてます')
        }
    }
}


console.log('startup process finish')
