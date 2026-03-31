import { describe, expect, it } from 'vitest'
import { parseResumeText } from './resumeParser.js'

describe('parseResumeText', () => {
  it('extracts basic fields from English resume text', () => {
    const text = `
John Doe
Location: Berlin, Germany
Email: john.doe@example.com
WhatsApp: +49 151 23456789
Phone: +49 30 123456

Summary
Senior software engineer with 7 years of experience building web applications.

Education
Technical University of Berlin, Master of Science, Computer Science
`

    const r = parseResumeText(text)
    expect(r.name).toBe('John Doe')
    expect(r.country).toContain('Germany')
    expect(r.city).toContain('Berlin')
    expect(r.email).toBe('john.doe@example.com')
    expect(r.workYears).toBe(7)
    expect(r.introSummaryOriginal && r.introSummaryOriginal.length).toBeGreaterThan(10)
    expect(r.education && r.education.length).toBeGreaterThan(0)
  })

  it('extracts basic fields from Chinese resume text', () => {
    const text = `
姓名：张三
现居：上海，中国
邮箱：zhangsan@example.com
电话：+86 138 0013 8000

个人简介
有 5 年工作经验，专注于前端工程化与性能优化。

教育经历
复旦大学 本科 计算机科学
`

    const r = parseResumeText(text)
    expect(r.name).toBe('张三')
    expect(r.city).toContain('上海')
    expect(r.country).toContain('中国')
    expect(r.email).toBe('zhangsan@example.com')
    expect(r.workYears).toBe(5)
    expect(r.education?.length ?? 0).toBeGreaterThan(0)
  })
})
