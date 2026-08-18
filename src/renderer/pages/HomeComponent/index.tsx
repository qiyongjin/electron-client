import { useKnaban } from "../../stores/useKanban"
import  {Board} from "../../components/Board"

const HomeComponent = () =>{
    const { createBoard } = useKnaban()

    const Test = async () => {
        console.log('测试')
        const data = await window?.electronAPI?.readFile("C:\\Users\\Administrator\\aipywork\\126\\ai_image_1787043884687.png")
        const datas = await window?.electronAPI?.ping("C:\\Users\\Administrator\\aipywork\\126\\ai_image_1787043884687.png")
        console.log('HomeComponent render', data,"88888888", datas)
    }
    

    return (
        <div className="w-full p-3">
           {/* {
            boards.map(board => (
                <div key={board.id}>{board.name}---{board.id}</div>
            ))
           } */}
           <Board></Board>
           {/* <button className="border-tneutral-400 p-3 mt-2 rounded-2xl bg-blue-500 text-stone-50 pointer-coarse: w-[100px] flex align-middle justify-center h-12"
           onClick={()=> createBoard({
            id: `${Math.floor(Math.random()*10000)}`,
            groupName: '新版',
            task: []
            })}>创建分组</button> */}

            <button onClick={()=>Test()}>测试</button>
        </div>
    )
}

export default HomeComponent