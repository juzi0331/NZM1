// 114514

import { getPtqrToken } from './utils.js';

export async function handleAuthQR(request) {
    // 1. Fetch QR Image. Added daid=5 (QZone) and pt_3rd_aid=0 to match standard requests.
    const qrUrl = 'https://ssl.ptlogin2.qq.com/ptqrshow?appid=549000912&e=2&l=M&s=3&d=72&v=4&t=0.5' + Date.now() + '&daid=5&pt_3rd_aid=0';
    const resp = await fetch(qrUrl);
    if (!resp.ok) {
        return new Response(JSON.stringify({
            success: false,
            message: `QR upstream failed: ${resp.status}`
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 2. Get qrsig from headers
    const setCookie = resp.headers.get('set-cookie') || '';
    let qrsig = '';
    const match = setCookie.match(/qrsig=([^;,]+)/);
    if (match) qrsig = match[1];

    // 3. Convert image to base64
    const arrayBuffer = await resp.arrayBuffer();
    if (!qrsig || !arrayBuffer || arrayBuffer.byteLength === 0) {
        return new Response(JSON.stringify({
            success: false,
            message: 'Failed to read qrsig from upstream response'
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataUrl = `data:image/png;base64,${base64}`;

    return new Response(JSON.stringify({
        success: true,
        data: { qrcode: dataUrl, qrsig: qrsig }
    }), { headers: { 'Content-Type': 'application/json' } });
}

export async function handleAuthCheck(request) {
    const url = new URL(request.url);
    const qrsig = url.searchParams.get('qrsig');

    if (!qrsig) {
        return new Response(JSON.stringify({ success: false, status: -1, message: 'missing qrsig' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const ptqrtoken = getPtqrToken(qrsig);
    const checkUrl = `https://ssl.ptlogin2.qq.com/ptqrlogin?u1=https%3A%2F%2Fqzone.qq.com%2F&ptqrtoken=${ptqrtoken}&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-${Date.now()}&js_ver=21020514&js_type=1&login_sig=&pt_uistyle=40&aid=549000912&daid=5&`;

    const resp = await fetch(checkUrl, {
        headers: { 'Cookie': `qrsig=${qrsig}` }
    });
    const text = await resp.text();

    // Status codes: 
    // 0 = Success
    // 66 = Scanning (Not scanned yet)
    // 67 = Confirming (Scanned, waiting for click)
    // 65 = Expired

    if (text.includes("ptuiCB('0'")) {
        const extraction = /ptuiCB\('0','0','(.*?)','0','(.*?)', '(.*?)'\)/.exec(text);
        const nickname = extraction ? extraction[3] : 'User';
        const rawSetCookie = resp.headers.get('set-cookie') || '';

        // Manual extraction because we need specific keys
        let uin = '', skey = '';
        const uinMatch = rawSetCookie.match(/uin=([^;]+)/);
        if (uinMatch) uin = uinMatch[1];

        const skeyMatch = rawSetCookie.match(/skey=([^;]+)/);
        if (skeyMatch) skey = skeyMatch[1];

        // Fallback: sometimes uin is pt2gguin or similar, but for QZone standard logic usually uin/skey are present.
        // If not found, send rawSetCookie, but cleaned one is better.
        const finalCookie = (uin && skey) ? `uin=${uin}; skey=${skey};` : rawSetCookie;

        return new Response(JSON.stringify({
            success: true,
            status: 0,
            message: '登录成功',
            data: {
                nickname,
                cookie: finalCookie
            }
        }));
    } else if (text.includes("ptuiCB('66'")) {
        return new Response(JSON.stringify({ success: true, status: 66, message: '请使用手机QQ扫码' }));
    } else if (text.includes("ptuiCB('67'")) {
        return new Response(JSON.stringify({ success: true, status: 67, message: '请在手机上确认登录' }));
    } else if (text.includes("ptuiCB('65'")) {
        return new Response(JSON.stringify({ success: true, status: 65, message: '二维码已过期' }));
    } else {
        return new Response(JSON.stringify({ success: false, status: -1, message: '状态异常', raw: text }));
    }
}
