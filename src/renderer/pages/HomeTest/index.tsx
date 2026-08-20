
const HomeTest = () =>{

    const Test = async () => {
        console.log('测试')
        const data = await window?.electronAPI?.readFile("C:\\Users\\Administrator\\aipywork\\126\\ai_image_1787043884687.png")
        const datas = await window?.electronAPI?.ping()
        const primaryDisplay = await window?.electronAPI?.getPrimaryDisplay()
        console.log('HomeComponent render', data,"88888888", datas, primaryDisplay)
    }
    

    return (
        <div className="w-full p-3">
            <button onClick={()=>Test()}>测试</button>
            <button onClick={()=>window?.electronAPI?.getWindowClose()}>窗口关闭</button>
            <button onClick={()=>window?.electronAPI?.showMessageBox({ title: '测试', message: '这是一个测试弹窗' })}>打开弹窗</button>
            <button onClick={()=>window?.electronAPI?.getPath("userData")}>获取应用路径</button>
        </div>
    )
}

export default HomeTest