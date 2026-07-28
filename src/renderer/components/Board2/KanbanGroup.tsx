import { useDroppable } from "@dnd-kit/core"

interface KanbanGroupProps extends React.PropsWithChildren{
    title: string 
    groupId: string |number
}

export const KanbanGroup = (props: KanbanGroupProps) =>{
    const { children, groupId} = props
    const { setNodeRef } = useDroppable({
        id: groupId,
    })
    return (
        <div ref={setNodeRef}>{children}
        </div>
    )
}