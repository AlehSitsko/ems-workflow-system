import { useState } from "react";

import { getPatients } from "../api/patientsApi";

// Patient list/search/pagination slice of PatientsPage (decomposition phase 2b).
// Owns the search inputs, the loaded list + pagination meta, the current filters,
// the "show archived" toggle, and the has-searched flag. Behavior is unchanged.
//
// `loading`/`error` remain page-level (shared with the form save flow), so their
// setters are passed in. `clearSelection` lets search/show-all clear the open
// patient + call history exactly as before, without this hook owning drawer state.
export function usePatients({ setLoading, setError, clearSelection }) {
  const PER_PAGE = 25;

  const [searchName, setSearchName] = useState("");
  const [searchDob, setSearchDob] = useState("");
  const [patients, setPatients] = useState([]);
  const [paginationMeta, setPaginationMeta] = useState({ page: 1, total: 0, pages: 0 });
  const [currentFilters, setCurrentFilters] = useState({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const loadPatients = async (filters, pageNum = 1, append = false, includeArchived = showArchived) => {
    setCurrentFilters(filters);
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const data = await getPatients({ ...filters, showArchived: includeArchived }, pageNum, PER_PAGE);
      setPatients((prev) => append ? [...prev, ...data.items] : data.items);
      setPaginationMeta({ page: data.page, total: data.total, pages: data.pages });
    } catch (err) {
      setError(err.message || "Failed to load patients.");
      if (!append) setPatients([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleToggleShowArchived = async () => {
    const next = !showArchived;
    setShowArchived(next);
    if (hasSearched) {
      await loadPatients(currentFilters, 1, false, next);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();

    setError("");
    setHasSearched(true);

    try {
      if (!searchName.trim() && !searchDob.trim()) {
        setError("Please enter a patient name or date of birth.");
        setPatients([]);
        clearSelection();
        return;
      }

      const filters = { name: searchName.trim(), dob: searchDob.trim() };
      await loadPatients(filters, 1, false);
      clearSelection();
    } catch (err) {
      setError(err.message || "Failed to search patients.");
      setPatients([]);
      clearSelection();
    }
  };

  const handleShowAll = async () => {
    setError("");
    setHasSearched(true);
    clearSelection();
    await loadPatients({}, 1, false);
  };

  return {
    PER_PAGE,
    searchName,
    setSearchName,
    searchDob,
    setSearchDob,
    patients,
    setPatients,
    paginationMeta,
    currentFilters,
    loadingMore,
    showArchived,
    hasSearched,
    setHasSearched,
    loadPatients,
    handleToggleShowArchived,
    handleSearch,
    handleShowAll,
  };
}
