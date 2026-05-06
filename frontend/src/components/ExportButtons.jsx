import React from 'react';

const ExportButtons = ({ onClearAll }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="container mt-4 mb-4 d-flex justify-content-end gap-2">
      <button className="btn btn-outline-secondary" onClick={onClearAll}>
        🧹 Clear All Fields
      </button>
      <button className="btn btn-outline-primary" onClick={handlePrint}>
        🖨 Print Form
      </button>
    </div>
  );
};

export default ExportButtons;
