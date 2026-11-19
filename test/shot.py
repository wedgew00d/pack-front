import sys, pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
url = root.joinpath('index.html').as_uri() + '#debug'
out = pathlib.Path('/tmp/pf'); out.mkdir(exist_ok=True)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(url); pg.wait_for_timeout(900); pg.screenshot(path=str(out / '1_title.png'))
    pg.click('#mStart'); pg.wait_for_timeout(200)
    pg.evaluate("PACK.run.coin=60; PACK.run.shop=[{key:'pistol',sold:false},{key:'flamer',sold:false},{key:'ammo',sold:false},{key:'scope',sold:false}]; PACK.run.exp=3; PACK.changed()")

    def drag(a, b, rot=0, shot=None):
        pg.mouse.move(a['x'], a['y']); pg.mouse.down(); pg.mouse.move(a['x'] + 12, a['y'] + 12, steps=2); pg.mouse.move(b['x'], b['y'], steps=6)
        for _ in range(rot): pg.keyboard.press('r')
        pg.wait_for_timeout(80)
        if shot: pg.screenshot(path=str(out / shot))
        pg.mouse.up(); pg.wait_for_timeout(60)
    card = lambda i: pg.evaluate(f"PACK.card({i})")
    cell = lambda w, x, y: pg.evaluate(f"PACK.cell('{w}',{x},{y})")
    items = lambda: pg.evaluate("PACK.run.items.map(i=>i.key+i.lv+'@'+i.where+i.x+','+i.y+'r'+i.rot).join(' ')")
    print('初期      ', items(), 'coin', pg.evaluate('PACK.run.coin'))
    # ハンドガンを既存のハンドガン(2,2)-(3,2)へ重ねて合成
    drag(card(0), cell('bag', 2, 2), shot='2_merge_hover.png'); print('合成後    ', items(), 'coin', pg.evaluate('PACK.run.coin'))
    # 弾薬箱をハンドガンの右隣(4,2)へ → リンク1
    drag(card(2), cell('bag', 4, 2)); print('弾薬箱後  ', items(), 'links', pg.evaluate('PACK.S.computeBuild(PACK.run).links.length'))
    # 火炎放射器（3x2）を回転1回して置く
    c = cell('bag', 1, 3); drag(card(1), {'x': c['x'], 'y': c['y'] + 20}, rot=0); print('火炎後    ', items())
    # 置いた物を別の場所へ移動、範囲外は元に戻る
    drag(cell('bag', 4, 2), cell('bag', 5, 1)); print('移動後    ', items())
    drag(cell('bag', 5, 1), {'x': 5, 'y': 400}); print('範囲外drop', items())
    # スコープを購入ボタンで待機スペースへ → 回転ボタン → 売却
    pg.mouse.click(card(3)['x'], card(3)['y']); pg.click('#bBuy'); print('購入ボタン', items())
    pg.screenshot(path=str(out / '3_prep.png'))
    pg.click('#bRot'); pg.click('#bSell'); print('売却後    ', items(), 'coin', pg.evaluate('PACK.run.coin'))
    pg.click('#bExpand'); pg.click('#bReroll'); print('拡張/入替 exp', pg.evaluate('PACK.run.exp'), 'coin', pg.evaluate('PACK.run.coin'))
    # 戦闘（最終波の絵を見る）
    pg.evaluate("PACK.run.wave=6; var r=PACK.run; ['smg','tesla','launcher','rifle'].forEach((k,i)=>{var p=PACK.S.firstFit(r,k,0,'bag'); if(p) PACK.S.addItem(r,k,1,'bag',p.x,p.y,0)}); PACK.changed()")
    pg.screenshot(path=str(out / '4_prep_full.png'))
    pg.click('#bGo'); pg.evaluate('PACK.step(600)'); pg.wait_for_timeout(250); pg.screenshot(path=str(out / '5_battle.png'))
    print('戦闘中 enemies', pg.evaluate('PACK.B.enemies.length'), 'hp', pg.evaluate('Math.round(PACK.B.hp)'), 'kills', pg.evaluate('PACK.B.kills'))
    pg.evaluate('PACK.step(6000)'); pg.wait_for_timeout(1500); print('戦闘後 mode', pg.evaluate('PACK.mode'), 'wave', pg.evaluate('PACK.run.wave'))
    pg.screenshot(path=str(out / '6_after.png'))
    pg.click('#bPause'); pg.wait_for_timeout(100); pg.screenshot(path=str(out / '7_pause.png'))
    pg.close()
    pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(url); pg.click('#mStart'); pg.wait_for_timeout(200); pg.screenshot(path=str(out / '8_pc.png'))
    b.close()
print('errors:', errs)
