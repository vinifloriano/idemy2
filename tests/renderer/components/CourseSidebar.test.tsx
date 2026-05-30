import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import CourseSidebar from '@renderer/components/CourseSidebar'
import { Course, Video } from '@shared/types'

const mockVideo: Video = {
  id: 'v1',
  section_id: 's1',
  title: 'Test Video',
  file_path: '/path/v1.mp4',
  duration: 100,
  progress: 0,
  is_completed: false,
  order_index: 0,
}

const mockCourse: Course = {
  id: 'c1',
  title: 'Test Course',
  root_path: '/path',
  created_at: '',
  last_accessed: '',
  sections: [
    {
      id: 's1',
      course_id: 'c1',
      title: 'Section 1',
      order_index: 0,
      videos: [mockVideo],
    },
  ],
}

test('renders sections and videos', () => {
  render(<CourseSidebar course={mockCourse} activeVideoId={null} onSelectVideo={() => {}} />)
  
  expect(screen.getByText('Section 1')).toBeInTheDocument()
  expect(screen.getByText('Test Video')).toBeInTheDocument()
})

test('calls onSelectVideo when a video is clicked', () => {
  const handleSelect = vi.fn()
  render(<CourseSidebar course={mockCourse} activeVideoId={null} onSelectVideo={handleSelect} />)
  
  fireEvent.click(screen.getByText('Test Video'))
  expect(handleSelect).toHaveBeenCalledWith(mockVideo)
})

test('collapses section when clicked', () => {
  render(<CourseSidebar course={mockCourse} activeVideoId={null} onSelectVideo={() => {}} />)
  
  const sectionButton = screen.getByText('Section 1').closest('button')
  fireEvent.click(sectionButton!)
  
  // The video text should no longer be visible or its parent container should be hidden
  const sectionContainer = screen.getByText('Test Video').closest('.flex.flex-col.py-1')
  expect(sectionContainer).toHaveClass('hidden')
})
