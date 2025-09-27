-- supabase/migrations/20250119_create_error_logs_table.sql
-- Create error_logs table for comprehensive error tracking
CREATE TABLE IF NOT EXISTS public.error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic error information
    error_type VARCHAR(100) NOT NULL, -- e.g., 'brain_dump_processing', 'api_error', 'database_error'
    error_code VARCHAR(50), -- e.g., '22P02', 'NETWORK_ERROR'
    error_message TEXT NOT NULL,
    error_stack TEXT, -- Full stack trace
    severity VARCHAR(20) DEFAULT 'error', -- 'critical', 'error', 'warning', 'info'
    
    -- Context information
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    brain_dump_id UUID REFERENCES public.brain_dumps(id) ON DELETE SET NULL,
    
    -- Request context
    endpoint VARCHAR(255), -- API endpoint or function name
    http_method VARCHAR(10), -- GET, POST, PUT, DELETE
    request_id VARCHAR(100), -- Unique request identifier for tracing
    user_agent TEXT,
    ip_address INET,
    
    -- LLM specific metadata (for brain dump processing)
    llm_provider VARCHAR(50), -- 'openai', 'ollama', 'anthropic'
    llm_model VARCHAR(100), -- 'gpt-4', 'claude-3', etc.
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    response_time_ms INTEGER, -- Response time in milliseconds
    llm_temperature DECIMAL(3,2),
    llm_max_tokens INTEGER,
    
    -- Operation details
    operation_type VARCHAR(50), -- 'create', 'update', 'delete', 'query'
    table_name VARCHAR(100), -- Database table involved
    record_id UUID, -- ID of the record being operated on
    operation_payload JSONB, -- The actual data being processed
    
    -- Additional metadata
    metadata JSONB DEFAULT '{}', -- Flexible field for additional context
    environment VARCHAR(20) DEFAULT 'development', -- 'development', 'staging', 'production'
    app_version VARCHAR(20), -- Application version
    browser_info JSONB, -- Browser details if from client
    
    -- Error resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_error_logs_user_id ON public.error_logs(user_id);
CREATE INDEX idx_error_logs_project_id ON public.error_logs(project_id);
CREATE INDEX idx_error_logs_brain_dump_id ON public.error_logs(brain_dump_id);
CREATE INDEX idx_error_logs_error_type ON public.error_logs(error_type);
CREATE INDEX idx_error_logs_severity ON public.error_logs(severity);
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX idx_error_logs_resolved ON public.error_logs(resolved);
CREATE INDEX idx_error_logs_llm_provider ON public.error_logs(llm_provider) WHERE llm_provider IS NOT NULL;

-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
-- Admin users can view all error logs
CREATE POLICY "Admin users can view all error logs"
    ON public.error_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admin users can create error logs
CREATE POLICY "Admin users can create error logs"
    ON public.error_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Admin users can update error logs (for resolution)
CREATE POLICY "Admin users can update error logs"
    ON public.error_logs
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Service role can do everything
CREATE POLICY "Service role has full access to error logs"
    ON public.error_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_error_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_error_logs_updated_at_trigger
    BEFORE UPDATE ON public.error_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_error_logs_updated_at();

-- Create a view for error summary statistics
CREATE OR REPLACE VIEW public.error_summary AS
SELECT 
    error_type,
    severity,
    COUNT(*) as error_count,
    COUNT(DISTINCT user_id) as affected_users,
    COUNT(DISTINCT project_id) as affected_projects,
    MIN(created_at) as first_occurrence,
    MAX(created_at) as last_occurrence,
    COUNT(CASE WHEN resolved = true THEN 1 END) as resolved_count,
    AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL) as avg_response_time_ms
FROM public.error_logs
GROUP BY error_type, severity;

-- Grant access to the view
GRANT SELECT ON public.error_summary TO authenticated;