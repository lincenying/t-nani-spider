import { URL, URLSearchParams } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'

// import SocksAgent from 'axios-socks5-agent'
import lodash from 'lodash'
import iconv from 'iconv-lite'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { mkdirp } from 'mkdirp'
import { mapLimit } from 'async'

import colors from 'colors'

// const { httpAgent, httpsAgent } = new SocksAgent({
//     agentOptions: {
//         keepAlive: true,
//     },
//     host: '127.0.0.1',
//     port: 2080,
// })

// const __dirname = path.dirname(fileURLToPath(import.meta.url))

colors.setTheme({
    red: 'red',
    green: 'green',
    blue: 'blue',
    yellow: 'yellow',
})

const lists = [
    {
        type: 'P',
        xcode: '016',
        maxPage: 2, // 1
    },
    {
        type: 'X',
        xcode: '030',
        maxPage: 19, // 1
    },
    {
        type: 'Y',
        xcode: '007',
        maxPage: 15, // 1
    },
    {
        type: 'X',
        xcode: '004',
        maxPage: 24, // 1
    },
    {
        type: 'X',
        xcode: '027',
        maxPage: 20, // 1
    },
]

const options = {
    saveTo: 'G:\\PhotoAlbum\\www.t-nani.co.kr',
    downLimit: 5,
    start: 3873, // 2131 (最后一条数据行号 - 1)
    hasList: false,
}

interface ListType {
    url: string
    html: string
}

async function getList(url: string): Promise<null | ListType> {
    console.log('开始下载列表页面：%s'.blue, url)
    return axios({
        url,
        responseType: 'arraybuffer',
    })
        .then(({ data }) => {
            console.log('下载列表页面成功：%s'.green, url)
            const str = iconv.decode(Buffer.from(data), 'EUC-KR')
            const html = iconv.encode(str, 'utf8').toString()
            return {
                url,
                html,
            }
        })
        .catch((err) => {
            return null
            console.log(err.message)
        })
}

function writeJson(url: string) {
    const jsonTxt = fs.readFileSync('./lists.json', 'utf-8')
    const json = JSON.parse(jsonTxt)
    if (!json.includes(url)) {
        json.push(url)
        const text = JSON.stringify(json, null, '\t')
        fs.writeFileSync('./lists.json', text)
        console.log('写入地址成功：%s'.green, url)
    }
    else {
        console.log('该地址已经存在：%s'.red, url)
    }
}

function parseList(payload: ListType) {
    console.log('开始分析列表页面数据：%s'.blue, payload.url)
    const $ = cheerio.load(payload.html)
    const $return: string[] = []
    $('.item-list.grid4')
        .find('.item-thumb')
        .each(function () {
            // eslint-disable-next-line no-invalid-this
            const link = $(this).find('a').attr('href')
            const branduid = new URLSearchParams(link?.replace('/shop/shopdetail.html', '')).get('branduid')
            if (branduid) {
                writeJson(`/shop/shopdetail.html?branduid=${branduid}`)
                $return.push(`/shop/shopdetail.html?branduid=${branduid}`)
            }
        })
}

async function makeDir(item: { id: string; xcode: Nullable<string>; type: Nullable<string> }) {
    return new Promise((resolve) => {
        // const dir = path.join(options.saveTo, item.type + '-' + item.xcode + '-' + item.id)
        const dir = path.join(options.saveTo, item.id)
        console.log('准备创建目录：%s'.blue, dir)
        if (fs.existsSync(dir)) {
            console.log('目录：%s 已经存在'.red, dir)
            resolve(item)
        }
        else {
            mkdirp(dir).then(() => {
                console.log('目录：%s 创建成功'.green, dir)
                resolve(item)
            })
        }
    })
}

async function getDetail(url: string): Promise<ListType> {
    console.log('开始下载详情页面：%s'.blue, url)
    return axios({
        url,
        timeout: 10000,
        responseType: 'arraybuffer',
    })
        .then(({ data }) => {
            console.log('下载详情页面成功：%s'.green, url)
            const str = iconv.decode(Buffer.from(data), 'EUC-KR')
            const html = iconv.encode(str, 'utf8').toString()
            return {
                url,
                html,
            }
        })
        .catch(async () => {
            console.log('抓取页面失败')
            return await getDetail(url)
        })
}

function parseDetail(payload: ListType) {
    console.log('开始分析详情页面数据：%s'.blue, payload.url)
    const $ = cheerio.load(payload.html)
    const $return: string[] = []
    $('.prd-detail')
        .find('img')
        .each(function () {
            // eslint-disable-next-line no-invalid-this
            const link = $(this).attr('src') || ''
            $return.push(link)
        })
    return $return
}

async function downImage(imgsrc: string, dir: string) {
    const url = new URL(imgsrc)
    const fileName = path.basename(url.pathname)
    const toPath = path.join(options.saveTo, dir, fileName)
    console.log('开始下载图片：%s，保存到：%s'.blue, fileName, dir)
    if (fs.existsSync(toPath)) {
        console.log('图片已经存在：%s'.yellow, imgsrc)
        return null
    }
    else {
        try {
            const { data } = await axios({
                method: 'get',
                url: imgsrc,
                responseType: 'arraybuffer',
                timeout: 10000,
            })
            console.log('图片下载成功：%s'.green, imgsrc)
            await fs.promises.writeFile(toPath, data, 'binary')
            console.log('图片保存成功：%s'.yellow, fileName)
        }
        catch (error) {
            console.log('图片下载失败：%s'.red, imgsrc)
            await downImage(imgsrc, dir)
        }
    }
}

function asyncMapLimit(imgs: string[], id: string) {
    return new Promise((resolve) => {
        mapLimit(
            imgs,
            options.downLimit,
            async (img: string) => {
                if (
                    !img.includes('detail.jpg')
                    && !img.includes('modelsize.jpg')
                    && !img.includes('tn-op-line.jpg')
                    && !img.includes('page_20.jpg')
                    && !img.includes('tnanilogo.jpg')
                    && !img.includes('detail_')
                )
                    await downImage(img, id)

                return img
            },
            (err) => {
                if (err)
                    console.log(err)

                resolve(null)
            },
        )
    })
}

function uniqArray(arr: any[]) {
    return lodash.uniq(arr)
}

async function init() {
    if (!options.hasList) {
        const listLength = lists.length
        for (let i = 0; i < listLength; i++) {
            const item = lists[i]
            for (let page = 1; page <= item.maxPage; page++) {
                const url = `http://www.t-nani.co.kr/shop/shopbrand.html?type=${item.type}&xcode=${item.xcode}&sort=&page=${page}`
                let listHtml
                let retry = 0
                while (!listHtml || retry < 5) {
                    try {
                        listHtml = await getList(url) // 获取列表
                        retry = 5
                    }
                    catch (error) {
                        retry++
                    }
                }
                if (listHtml)
                    parseList(listHtml) // 解析列表代码 取得详情列表
            }
        }
        console.log('所有连接读取完成'.green)
    }
    const jsonTxt = fs.readFileSync('./lists.json', 'utf-8')
    const json = JSON.parse(jsonTxt)
    for (let i = options.start; i < json.length; i++) {
        const url = `http://www.t-nani.co.kr${json[i]}`
        const myURL = new URL(url)
        const params = new URLSearchParams(myURL.search)
        const id = params.get('branduid') || ''
        const xcode = params.get('xcode')
        const type = params.get('type')
        await makeDir({ id, xcode, type })
        let detailHtml: Nullable<ListType> = null
        let retry = 0
        while (!detailHtml || retry < 5) {
            try {
                detailHtml = await getDetail(url)
                retry = 5
            }
            catch (error) {
                retry++
            }
        }
        let imgArr = parseDetail(detailHtml)
        imgArr = uniqArray(imgArr)
        const length = imgArr.length
        console.log('开始下载图片, 总数：%s'.blue, length)
        try {
            await asyncMapLimit(imgArr, id)
        }
        catch (error) {
            console.log(error)
        }
        console.log('图片下载完成, 总数：%s'.blue, length)
    }
    console.log('所有图片下载完成'.green)
}

init()
