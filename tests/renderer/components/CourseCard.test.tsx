import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CourseCard from '@renderer/components/CourseCard'
import { Course } from '@shared/types'

const mockCourse: Course = {
  id: '1',
  title: 'Test Course',
  root_path: '/path/to/course',
  created_at: new Date().toISOString(),
  last_accessed: new Date().toISOString(),
  sections: [],
  progress: 50,
}

test('renders course title and progress', () => {
  render(<CourseCard course={mockCourse} onClick={() => {}} />)
  
  expect(screen.getByText('Test Course')).toBeInTheDocument()
  expect(screen.getByText('50% Complete')).toBeInTheDocument()
})

test('calls onClick when clicked', () => {
  const handleClick = vi.fn()
  render(<CourseCard course={mockCourse} onClick={handleClick} />)
  
  screen.getByText('Test Course').click()
  expect(handleClick).toHaveBeenCalledTimes(1)
})
