import { create } from "zustand";

interface Board {
    id: number | string;
    groupName: string;
    task: (string | number)[];
}

export const useKnaban = create<{
    boards: Board[];
    createBoard: (board: Board) => void;
    updateBoard: (id: Board['id'], updates: Partial<Board>) => void;
    deleteBoard: (id: Board['id']) => void;
    moveTask: (
        taskId: string | number,
        sourceId: Board['id'],
        targetId: Board['id'],
    ) => void;
    // 排序
    taskSort:(
        groupId: Board["id"],
        activeTaskId: string | number,// 在哪个元素前插入
        overTaskId: string | number// 删除已插入的内容
    ) => void;

}>((set) => ({
    boards:[],
    createBoard: (board) => set((state) => ({ 
        boards: [...state.boards, board] 
    })),
    updateBoard: (id, updates) => set((state) => ({
        boards: state.boards.map((board) =>
            board.id === id ? { ...board, ...updates } : board
        )
    })),
    deleteBoard: (id) => set((state) => ({
        boards: state.boards.filter((board) =>board.id !== id)
    })),
    moveTask: (
        taskId: string | number,
        sourceId: Board['id'],
        targetId: Board['id'],
    ) => set((state)=>({
        boards: state.boards.map((board)=>{
            if (board.id === sourceId) {
                // 从源看板移除任务
                return {
                    ...board,
                    task: board.task.filter((task) => task !== taskId)
                };
            }
            if (board.id === targetId) {
                // 添加到目标看板（避免重复添加）
                if (!board.task.includes(taskId)) {
                    return {
                        ...board,
                        task: [...board.task, taskId]
                    };
                }
            }
            return board;
        })
    })),
taskSort: (
  groupId: Board["id"],
  activeTaskId: string | number,
  overTaskId: string | number
) =>
  set((state) => ({
    boards: state.boards.map((board) => {
      if (board.id === groupId) {
        const tasks = [...board.task];

        // 1. 去掉原来的位置
        const fromIndex = tasks.indexOf(activeTaskId);
        if (fromIndex !== -1) tasks.splice(fromIndex, 1);

        // 2. 计算插入位置
        const toIndex = tasks.indexOf(overTaskId);

        if (toIndex === -1) {
          // overTaskId 不存在则追加到末尾
          tasks.push(activeTaskId);
        } else {
          // 插入到目标任务前
          tasks.splice(toIndex, 0, activeTaskId);
        }

        return {
          ...board,
          task: tasks,
        };
      }
      return board;
    }),
  }))
}))