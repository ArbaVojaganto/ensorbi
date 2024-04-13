
import { routes } from "./router.ts"
import { posts, StoredPosts, registerTagMeta } from "./StoredPosts.ts"
import { TagMeta } from "./../models/tags.ts"
import { bufferToHash } from "./../common/util.ts"
import { buildDenoDeployProject } from "./viewerBundle.ts"
import { serverConfig } from "./ConfigLoader.ts";
import { clientPreBuild } from "./clientPreBuilder.ts"
import { Hono, Context } from 'https://deno.land/x/hono/mod.ts'


const startHttpServer = async () => {
    const app = new Hono()
    // システムで要求されるタグが存在しなければ作成する
    if ( await posts.fetch(bufferToHash("node"))  == undefined ) await registerTagMeta( new TagMeta("", "node", "", "", "", {}, ""))
    if ( await posts.fetch(bufferToHash("tag"))  == undefined ) await registerTagMeta( new TagMeta("", "tag", "", "", "", {}, ""))
    if ( await posts.fetch(bufferToHash("blob"))  == undefined ) await registerTagMeta( new TagMeta("", "blob", "", "", "", {}, ""))
    if ( await posts.fetch(bufferToHash("entryPoint"))  == undefined ) await registerTagMeta( new TagMeta("", "entryPoint", "", "", "", {}, ""))
    
    routes(app);

    //    app.listen({ port: serverConfig.port, hostname: serverConfig.hostname });
    Deno.serve(app.fetch)
}

const reconstructReferrers = async () => {
    await posts.reconstructReferrers()
}

const migrationMetaFile = async () => {
    await posts.migrationMetaFile()
}

console.log(Deno.cwd());

let index = 0
for await (const arg of Deno.args){
    console.log(`arg: ${arg}`)
    switch(arg) {
        case "--http-server-with-client-prebuild": {
            await clientPreBuild()
            await startHttpServer()
            break
        }
        case "--http-server": {
            startHttpServer()
            break
        }
        case "--reconstruct-referrers": {
            reconstructReferrers()
            break
        }
        case "--migrate-meta-file": {
            migrationMetaFile()
            break
        }
        case "--build-deno-deploy-project": {
            let path = (index + 1 < Deno.args.length)? Deno.args[index+1] : "build/viewer/"
            path = (path.endsWith("/") || path.endsWith("\\"))? path: path+"/"
            
            buildDenoDeployProject(path)
            break
        }
        default: {
            console.warn('許容できない引数が指定されてます')
        }
    }
    index++
}


console.log('arguments parse finish')
