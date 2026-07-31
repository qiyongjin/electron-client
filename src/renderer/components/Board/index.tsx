import { DndContext, type DragEndEvent, closestCorners, DragOverlay } from "@dnd-kit/core"
import { useKnaban } from "../../stores/useKanban"
import { Task  } from "./Task"
import { KanbanGroup } from "./KanbanGroup"
import {useState} from "react"

export const Board = () => {
    const {boards, updateBoard, moveTask, deleteBoard, taskSort } =useKnaban()
      const [activeTask, setActiveTask] = useState<string | null>(null);
    const handleGragEnd = ({active, over}:DragEndEvent) => {
        console.log("-----", active, over)
        if (!over) return;

        const [fromGroup, fromTask] = `${active.id}`.split("-");
        const [toGroup, toTask] = `${over.id}`.split("-");

        // 跨组移动
        if (fromGroup !== toGroup) {
            moveTask(fromTask, fromGroup, toGroup);
            return;
        }

        // 同组排序
        if (fromGroup === toGroup) {
            taskSort(toGroup, fromTask, toTask);
        }
    }
    const handleDelete = (id:number| string) =>{
        deleteBoard(id)
    }
    
    return (
        <DndContext onDragEnd={handleGragEnd}  
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveTask(`${e.active.id}`)}
        onDragCancel={() => setActiveTask(null)}>
            <div className="flex flex-row flex-wrap gap-3">
                {
                    boards.map(board => (
                        <div className="flex flex-row" key={board.id}>
                            <KanbanGroup title={board.groupName} groupId={board.id}   taskIds={board.task}>
                                <div className="kanban-group w-[260px] bg-red-50 rounded-2xl p-2">
                                    <div className="flex">
                                        <div className="rounded-full w-full">
                                            <div className=" flex justify-between ">
                                            <div className="rounded-full bg-blue-300 p-1 pl-4 pr-4 w-[100px]text-amber-50 ">未开始</div>
                                            <div className="p-1 rounded-4xl bg-blue-300 pl-2 pr-2 cursor-pointer" onClick={()=>handleDelete(board.id)}>×</div>
                                            </div>
                                            <div className="mt-2">
                                                {
                                                    board.task.map((item)=> (<Task key={item} id={`${board.id}-${item}`} title={`${item}`}></Task>))
                                                }
                                            </div>
                                            <button className="p-2 bg-blue-300 mt-1 rounded-2xl w-full"
                                            onClick={()=> updateBoard(board.id, {
                                                ...board,
                                                task:[...board.task, `${Math.floor(Math.random() * 1000)}`],
                                            })}>添加任务</button>
                                        </div>

                                    </div>
                                </div>
                            </KanbanGroup>
                    </div>
                    ))
                }
            </div>
                  {/* 完整实现“脱离原地拖拽”的关键 */}
            <DragOverlay>
                {activeTask ? (
                <Task id={activeTask} title={activeTask.split("-")[1]} />
                ) : null}
            </DragOverlay>
        </DndContext>
    )
}