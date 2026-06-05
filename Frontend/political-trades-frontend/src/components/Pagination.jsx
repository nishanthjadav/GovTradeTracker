import { useEffect, useRef, useState } from "react";

export default function Pagination({
  currentPage,
  totalPages,
  pageSize = 25,
  totalResults = 0,
  onPageChange,
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (totalPages <= 1) return null;

  const start = Math.min((currentPage - 1) * pageSize + 1, totalResults || 0);
  const end = Math.min(currentPage * pageSize, totalResults || 0);

  const handleJump = (page) => {
    const target = Math.max(1, Math.min(totalPages, Number(page)));
    onPageChange(target);
  };

  const pageOptions = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="pagination">
      <button
        className="pagination-button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </button>

      <div className="pagination-center">
        <div className="pagination-range">
          {start}-{end} of {totalResults.toLocaleString()}
        </div>

        <div className="page-dropdown" ref={dropdownRef}>
          <button className="pagination-select" onClick={() => setOpen((openState) => !openState)}>
            Page {currentPage}
          </button>

          {open && (
            <div className="page-dropdown-menu">
              {pageOptions.map((page) => (
                <button
                  key={page}
                  className={`page-option ${page === currentPage ? "active" : ""}`}
                  onClick={() => {
                    handleJump(page);
                    setOpen(false);
                  }}
                >
                  Page {page}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        className="pagination-button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
}
