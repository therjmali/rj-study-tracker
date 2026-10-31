import { useState, useCallback, useEffect } from 'react';

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  dueTime?: string;
  category?: string;
  createdAt: string;
}

const STORAGE_KEY = 'nursetrack-todos';

function loadTodos(): TodoItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistTodos(todos: TodoItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

export function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);

  useEffect(() => {
    persistTodos(todos);
  }, [todos]);

  const addTodo = useCallback((todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => {
    setTodos(prev => [...prev, {
      ...todo,
      id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      completed: false,
      createdAt: new Date().toISOString(),
    }]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTodo = useCallback((id: string, changes: Partial<TodoItem>) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
  }, []);

  const getTodosForDate = useCallback((date: string) => {
    return todos.filter(t => t.dueDate === date);
  }, [todos]);

  const getPendingCountForDate = useCallback((date: string) => {
    return todos.filter(t => t.dueDate === date && !t.completed).length;
  }, [todos]);

  return { todos, addTodo, toggleTodo, deleteTodo, updateTodo, getTodosForDate, getPendingCountForDate };
}
