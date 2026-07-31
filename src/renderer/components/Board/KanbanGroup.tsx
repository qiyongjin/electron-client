import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"


interface KanbanGroupProps extends React.PropsWithChildren{
    title: string 
    groupId: string |number,
    taskIds: (string | number)[]
}

export const KanbanGroup = (props: KanbanGroupProps) =>{
    const { children, groupId, taskIds } = props
    const { setNodeRef } = useDroppable({
        id: groupId,
    })
    return (
        <div ref={setNodeRef}>
                  {/* 关键：必须放 sortable items */}
            <SortableContext
                    items={taskIds.map(id => `${groupId}-${id}`)}
                    strategy={verticalListSortingStrategy}
                >
                {children}
            </SortableContext>
        </div>
    )
}