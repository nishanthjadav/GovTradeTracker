import { useEffect, useMemo, useRef, useState } from "react";

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  allLabel = "All",
  width = 160,
  uppercase = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (!value) return allLabel;
    const match = options.find((o) => o.value === value);
    return match ? match.label : value;
  }, [value, options, allLabel]);

  const filteredOptions = useMemo(() => {
    const q = uppercase ? query.toUpperCase() : query.toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const haystack = uppercase ? o.label.toUpperCase() : o.label.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query, uppercase]);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div
      ref={wrapperRef}
      className="searchable-select"
      style={{ width, position: "relative" }}
    >
      {!open ? (
        <button
          type="button"
          className="searchable-select-trigger"
          onClick={() => setOpen(true)}
        >
          <span className="searchable-select-value">{selectedLabel}</span>
          <span className="searchable-select-chevron">▾</span>
        </button>
      ) : (
        <input
          ref={inputRef}
          type="text"
          className="searchable-select-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) =>
            setQuery(uppercase ? e.target.value.toUpperCase() : e.target.value)
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            } else if (e.key === "Enter" && filteredOptions.length > 0) {
              handleSelect(filteredOptions[0].value);
            }
          }}
        />
      )}

      {open && (
        <div className="searchable-select-menu">
          {value && (
            <button
              type="button"
              className="searchable-select-option searchable-select-option--clear"
              onClick={() => handleSelect("")}
            >
              {allLabel}
            </button>
          )}
          {filteredOptions.length === 0 ? (
            <div className="searchable-select-empty">No matches</div>
          ) : (
            filteredOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`searchable-select-option${
                  o.value === value ? " searchable-select-option--active" : ""
                }`}
                onClick={() => handleSelect(o.value)}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
