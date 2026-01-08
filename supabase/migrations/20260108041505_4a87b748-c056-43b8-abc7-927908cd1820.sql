-- Allow admins to view all receipt usage
CREATE POLICY "Admins can view all receipt usage"
ON receipt_usage
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'owner')
  )
);

-- Allow admins to manage all receipt usage (for reset quota)
CREATE POLICY "Admins can manage receipt usage"
ON receipt_usage
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'owner')
  )
);

-- Allow admins to view all receipt subscriptions
CREATE POLICY "Admins can view all receipt subscriptions"
ON receipt_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'owner')
  )
);

-- Allow admins to manage all receipt subscriptions (for change plan)
CREATE POLICY "Admins can manage receipt subscriptions"
ON receipt_subscriptions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'owner')
  )
);