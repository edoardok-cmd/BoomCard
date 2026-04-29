import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminProfileService } from '../../services/adminProfile.service';

const palette = {
  bg: '#faf9f5',
  surface: '#ffffff',
  border: '#e8e5dc',
  text: '#141413',
  textMuted: '#605a50',
  textSubtle: '#8c8678',
  accent: '#c96442',
  accentSoft: '#f3e8de',
  success: '#4a7c59',
};

const AdminProfileMyDataPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-profile-me'],
    queryFn: () => adminProfileService.getMe(),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (data) {
      setFirstName(data.firstName ?? '');
      setLastName(data.lastName ?? '');
      setPhone(data.phone ?? '');
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: () => adminProfileService.updateMe({ firstName, lastName, phone }),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['admin-profile-me'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Update failed');
    },
  });

  if (isLoading) return <Loading>Loading…</Loading>;
  if (!data) return <Loading>Profile not found</Loading>;

  return (
    <Wrapper>
      <Card>
        <SectionTitle>My data</SectionTitle>
        <Row>
          <Field>
            <Label>First name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field>
            <Label>Last name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </Row>
        <Row>
          <Field>
            <Label>Email</Label>
            <Input value={data.email} disabled />
            <Hint>Email changes require a verification flow — contact a SUPER_ADMIN.</Hint>
          </Field>
          <Field>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+359…" />
          </Field>
        </Row>

        <Footer>
          <Meta>
            <span>Role: <strong>{data.role}</strong></span>
            {data.adminRoles.length > 0 && (
              <span>
                Admin roles: {data.adminRoles.map((r) => r.role.label).join(', ')}
              </span>
            )}
            {data.lastLoginAt && (
              <span>Last login: {new Date(data.lastLoginAt).toLocaleString()}</span>
            )}
          </Meta>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </Footer>
      </Card>
    </Wrapper>
  );
};

const Wrapper = styled.div`padding: 0;`;
const Loading = styled.div`padding: 4rem 2rem; text-align: center; color: ${palette.textMuted};`;
const Card = styled.div`
  background: ${palette.surface};
  border: 1px solid ${palette.border};
  border-radius: 0.75rem;
  padding: 1.75rem;
  max-width: 60rem;
`;
const SectionTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${palette.text};
  margin: 0 0 1.25rem;
`;
const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const Field = styled.div`display: flex; flex-direction: column;`;
const Label = styled.label`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${palette.textMuted};
  margin-bottom: 0.375rem;
`;
const Input = styled.input`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${palette.border};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: ${palette.text};
  background: ${palette.bg};
  outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;
const Hint = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0.375rem 0 0;`;
const Footer = styled.div`
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-top: 1.25rem; gap: 1rem; flex-wrap: wrap;
`;
const Meta = styled.div`
  display: flex; flex-direction: column; gap: 0.25rem;
  font-size: 0.8125rem; color: ${palette.textSubtle};
`;
const Button = styled.button`
  background: ${palette.accent};
  color: white;
  border: 0;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  &:hover:not(:disabled) { background: #b65a3a; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export default AdminProfileMyDataPage;
