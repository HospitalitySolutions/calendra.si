import { useEffect, useRef } from 'react'

type ToolbarIconKind = 'bold' | 'italic' | 'underline' | 'link' | 'bullets' | 'numbers' | 'quote'

function ToolbarIcon({ kind }: { kind: ToolbarIconKind }) {
  if (kind === 'bold') return <span aria-hidden>B</span>
  if (kind === 'italic') return <em aria-hidden>I</em>
  if (kind === 'underline') return <span style={{ textDecoration: 'underline' }} aria-hidden>U</span>
  if (kind === 'link') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
      </svg>
    )
  }
  if (kind === 'bullets') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    )
  }
  if (kind === 'numbers') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 6h11M10 12h11M10 18h11" />
        <path d="M4 6h1v4M4 10h2M4 14h2l-2 4h2" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21c3 0 7-1 7-8V5H3v8h4c0 4-2 6-4 8Z" />
      <path d="M14 21c3 0 7-1 7-8V5h-7v8h4c0 4-2 6-4 8Z" />
    </svg>
  )
}

// Prevent the editor from losing its text selection when a toolbar control is pressed.
const keepSelectionOnMouseDown = (event: React.MouseEvent<HTMLButtonElement | HTMLSelectElement>) => {
  event.preventDefault()
}

export type RichTextEditorProps = {
  valueHtml: string
  onChangeHtml: (html: string) => void
  placeholder?: string
  ariaLabel?: string
  minHeight?: number
}

/**
 * Lightweight rich-text editor matching the notifications template editor design
 * (block style + bold/italic/underline/link/lists/quote) backed by document.execCommand.
 * Emits its HTML through onChangeHtml.
 */
export function RichTextEditor({ valueHtml, onChangeHtml, placeholder, ariaLabel, minHeight = 120 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)

  // Sync external value into the editor only when it differs and the user isn't actively typing.
  useEffect(() => {
    const element = editorRef.current
    if (!element) return
    if (document.activeElement === element) return
    const next = valueHtml || ''
    if (element.innerHTML !== next) {
      element.innerHTML = next
    }
  }, [valueHtml])

  const sync = () => {
    const element = editorRef.current
    if (!element) return
    onChangeHtml(element.innerHTML)
  }

  const exec = (command: string, value?: string) => {
    const element = editorRef.current
    if (!element) return
    element.focus()
    try {
      document.execCommand(command, false, value)
    } catch {
      // ignore browser execCommand failures
    }
    sync()
  }

  const applyBlockStyle = (style: string) => {
    if (style === 'normal') exec('formatBlock', 'p')
    else if (style === 'heading') exec('formatBlock', 'h2')
    else if (style === 'subheading') exec('formatBlock', 'h3')
    else if (style === 'small') exec('formatBlock', 'blockquote')
  }

  const insertLink = () => {
    const url = window.prompt('URL', 'https://')
    if (!url) return
    exec('createLink', url)
  }

  const isEmpty = !valueHtml || valueHtml.replace(/<br\s*\/?>(\s|&nbsp;)*/gi, '').replace(/<[^>]+>/g, '').trim() === ''

  return (
    <div className="rte-editor">
      <div className="rte-toolbar" aria-label="Orodna vrstica">
        <select
          className="rte-format"
          defaultValue="normal"
          onMouseDown={keepSelectionOnMouseDown}
          onChange={(event) => applyBlockStyle(event.target.value)}
        >
          <option value="normal">Normalno</option>
          <option value="heading">Naslov</option>
          <option value="subheading">Podnaslov</option>
          <option value="small">Citat</option>
        </select>
        <span className="rte-divider" aria-hidden />
        <button type="button" className="rte-button" aria-label="Krepko" title="Krepko" onMouseDown={keepSelectionOnMouseDown} onClick={() => exec('bold')}>
          <ToolbarIcon kind="bold" />
        </button>
        <button type="button" className="rte-button" aria-label="Ležeče" title="Ležeče" onMouseDown={keepSelectionOnMouseDown} onClick={() => exec('italic')}>
          <ToolbarIcon kind="italic" />
        </button>
        <button type="button" className="rte-button" aria-label="Podčrtano" title="Podčrtano" onMouseDown={keepSelectionOnMouseDown} onClick={() => exec('underline')}>
          <ToolbarIcon kind="underline" />
        </button>
        <button type="button" className="rte-button" aria-label="Vstavi povezavo" title="Vstavi povezavo" onMouseDown={keepSelectionOnMouseDown} onClick={insertLink}>
          <ToolbarIcon kind="link" />
        </button>
        <span className="rte-divider" aria-hidden />
        <button type="button" className="rte-button" aria-label="Označen seznam" title="Označen seznam" onMouseDown={keepSelectionOnMouseDown} onClick={() => exec('insertUnorderedList')}>
          <ToolbarIcon kind="bullets" />
        </button>
        <button type="button" className="rte-button" aria-label="Oštevilčen seznam" title="Oštevilčen seznam" onMouseDown={keepSelectionOnMouseDown} onClick={() => exec('insertOrderedList')}>
          <ToolbarIcon kind="numbers" />
        </button>
        <button type="button" className="rte-button" aria-label="Citat" title="Citat" onMouseDown={keepSelectionOnMouseDown} onClick={() => exec('formatBlock', 'blockquote')}>
          <ToolbarIcon kind="quote" />
        </button>
      </div>
      <div className="rte-surface">
        {isEmpty && placeholder ? <div className="rte-placeholder" aria-hidden>{placeholder}</div> : null}
        <div
          ref={editorRef}
          className="rte-content"
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel || placeholder}
          contentEditable
          suppressContentEditableWarning
          style={{ minHeight }}
          onInput={sync}
          onBlur={sync}
        />
      </div>
    </div>
  )
}

export default RichTextEditor
